import uuid
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import asc
from backend.models import models
from fastapi import HTTPException, status
from datetime import datetime, timedelta, timezone

from backend.services.trust_service import TrustService


def process_disbursement(db: Session, loan_id: int):
    """
    ULTIMATE SECURITY: Handles official release of funds.
    Uses Row-Level Locking to prevent double-disbursement holes.
    """
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id
    ).with_for_update().first()

    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    if loan.status == "disbursed":
        return None

    if loan.status != "approved":
        raise HTTPException(
            status_code=400, detail="Loan must be 'approved' to disburse.")

    new_tx = models.Transaction(
        loan_id=loan_id,
        amount=loan.amount,
        transaction_type="disbursement",
        reference_number=f"DISB-{uuid.uuid4().hex[:8].upper()}"
    )

    loan.status = "disbursed"
    db.add(new_tx)
    db.flush()
    db.refresh(new_tx)
    return new_tx


def process_repayment(db: Session, loan_id: int, amount: Decimal, user_id: int):
    """
    Handles loan repayments with high precision, trust rewards,
    early-payment bonuses, and race-condition protection.
    """

    # --- STEP 1: IDEMPOTENCY GUARD ---
    time_window = datetime.now(timezone.utc) - timedelta(seconds=30)
    duplicate = db.query(models.Transaction).filter(
        models.Transaction.loan_id == loan_id,
        models.Transaction.amount == amount,
        models.Transaction.transaction_type == "repayment",
        models.Transaction.timestamp >= time_window
    ).first()

    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate payment detected. Please wait 30 seconds."
        )

    # --- STEP 2: ROW LOCKING ---
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == user_id
    ).with_for_update().first()

    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found.")

    # --- STEP 3: DUST & OVERPAYMENT LOGIC ---
    if amount > loan.remaining_amount:
        remaining_to_pay = loan.remaining_amount
    elif abs(loan.remaining_amount - amount) < Decimal("0.01"):
        remaining_to_pay = loan.remaining_amount
    else:
        remaining_to_pay = amount

    # --- STEP 4: INSTALLMENT LOGIC (FIFO) + EARLY PAYMENT DETECTION ---
    unpaid_schedules = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.loan_id == loan_id,
        models.LoanSchedule.status == "unpaid"
    ).order_by(asc(models.LoanSchedule.due_date)).all()

    now = datetime.now(timezone.utc)
    days_early = 0

    temp_amount = remaining_to_pay
    for schedule in unpaid_schedules:
        if temp_amount <= 0:
            break

        # Calculate days early for the first installment being paid
        if days_early == 0 and schedule.due_date:
            due = schedule.due_date
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            diff = (due - now).days
            days_early = max(0, diff)

        payment_for_this_row = min(temp_amount, schedule.amount_due)
        schedule.amount_due -= payment_for_this_row
        temp_amount -= payment_for_this_row

        if schedule.amount_due < Decimal("0.01"):
            schedule.status = "paid"

    # --- STEP 5: TRUST SCORE REWARD (with early payment detection) ---
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        TrustService.apply_early_repayment_reward(
            db, user, days_early=days_early)

    # --- STEP 6: GLOBAL BALANCE & STATUS UPDATE ---
    loan.remaining_amount -= remaining_to_pay

    if loan.remaining_amount < Decimal("0.01"):
        loan.remaining_amount = Decimal("0.00")
        loan.status = "completed"
        loan.is_overdue = False
        loan.next_payment_due = None

        # Full loan completion notification
        full_notif = models.Notification(
            user_id=user_id,
            title="🎉 Loan Fully Repaid!",
            message=f"Congratulations! Your loan for '{loan.project_title}' has been fully repaid. Your trust score has been updated."
        )
        db.add(full_notif)
    else:
        next_schedule = db.query(models.LoanSchedule).filter(
            models.LoanSchedule.loan_id == loan_id,
            models.LoanSchedule.status == "unpaid"
        ).order_by(asc(models.LoanSchedule.due_date)).first()

        if next_schedule:
            loan.next_payment_due = next_schedule.due_date

    # --- STEP 7: RECORD TRANSACTION ---
    new_transaction = models.Transaction(
        loan_id=loan_id,
        amount=remaining_to_pay,
        transaction_type="repayment",
        reference_number=f"RPY-{uuid.uuid4().hex[:8].upper()}"
    )
    db.add(new_transaction)

    try:
        db.flush()
        db.refresh(new_transaction)
        return new_transaction
    except Exception as e:
        print(f"Internal Service Error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Database error while recording repayment."
        )


def get_loan_history(db: Session, loan_id: int):
    return db.query(models.Transaction).filter(
        models.Transaction.loan_id == loan_id
    ).order_by(models.Transaction.created_at.desc()).all()
