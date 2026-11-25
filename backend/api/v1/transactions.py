from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from decimal import Decimal
from backend.core.database import get_db
from backend.models import models
from backend.services import transaction_service as transactions_service
from backend.services.audit_service import log_action
from backend.core.security import get_current_user, get_current_admin, verify_transaction_auth

router = APIRouter(prefix="/transactions", tags=["Transactions"])

# --- 1. LOAN REPAYMENT ---


@router.post("/repay")
def repay_loan(
    loan_id: int,
    amount: Decimal,
    transaction_pin: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Validation & Auth
    if current_user.account_status != "active":
        raise HTTPException(
            status_code=403,
            detail=f"Blocked. Account is {current_user.account_status}"
        )

    # Note: verify_transaction_auth handles PIN strikes internally
    verify_transaction_auth(transaction_pin, current_user, db)

    # 2. Process
    try:
        # We pass the logic to the service.
        # The service uses .with_for_update() internally for row-locking.
        new_transaction = transactions_service.process_repayment(
            db, loan_id, amount, current_user.id
        )

        # 3. THE MASTER COMMIT
        # This finalizes the Transaction record, Loan balance, and User Trust Score
        db.commit()

        # Refresh to get the updated values from the DB
        db.refresh(current_user)

        # We fetch the loan specifically to return the updated balance
        loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()

        return {
            "message": f"Payment of {amount} PHP recorded!",
            "transaction_id": new_transaction.id,
            "remaining_balance": loan.remaining_amount if loan else 0,
            "new_trust_score": current_user.trust_score
        }

    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        print(f"Repayment Router Error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal transaction error during repayment."
        )

# --- 2. DISBURSEMENT (Admin Action) ---


@router.post("/disburse/{loan_id}")
def disburse_loan(
    request: Request,  # Captures metadata like IP address
    loan_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    try:
        # 1. Process the money (Service handles locking and status check)
        disbursement = transactions_service.process_disbursement(db, loan_id)

        if not disbursement:
            raise HTTPException(
                status_code=400, detail="Loan already disbursed.")

        # 2. AUDIT LOG: Track which admin released the funds
        log_action(
            db,
            admin_id=admin.id,
            action="LOAN_DISBURSEMENT",
            ip=request.client.host,
            target_id=loan_id,
            details={"amount": float(disbursement.amount)}
        )

        # 3. Finalize everything
        db.commit()

        return {
            "message": "Funds disbursed successfully and logged.",
            "transaction_id": disbursement.id,
            "reference": disbursement.reference_number
        }

    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        print(f"Disbursement Router Error: {e}")
        raise HTTPException(status_code=500, detail="Disbursement failed.")

# --- 3. VIEWING DATA ---


@router.get("/history/{loan_id}")
def get_payment_history(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()

    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found")

    history = transactions_service.get_loan_history(db, loan_id)
    return {
        "loan_id": loan_id,
        "project_title": loan.project_title,
        "current_balance": loan.remaining_amount,
        "transactions": history
    }


@router.get("/summary")
def get_financial_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    from sqlalchemy import func

    # FIX: Only count DISBURSED loans in total debt.
    # Pending/approved loans haven't been funded yet — showing them as debt is misleading.
    total_debt = db.query(models.Loan).filter(
        models.Loan.owner_id == current_user.id,
        models.Loan.status == "disbursed"
    ).with_entities(func.sum(models.Loan.remaining_amount)).scalar() or 0.0

    active_loans_count = db.query(models.Loan).filter(
        models.Loan.owner_id == current_user.id,
        models.Loan.status == "disbursed"
    ).count()

    return {
        "user": current_user.name,
        "total_outstanding_balance": total_debt,
        "active_loans_count": active_loans_count,
        "trust_score": current_user.trust_score
    }
