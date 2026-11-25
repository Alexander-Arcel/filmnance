import re
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from backend.models import models
# --- NEW IMPORT ---
from backend.services.trust_service import TrustService


def get_interest_rate_by_trust_score(trust_score: int) -> Decimal:
    """
    Returns Decimal rate for high-precision math.
    Gold Rate (10%) for 80+ score, Standard (15%) otherwise.
    """
    return Decimal("0.10") if trust_score >= 80 else Decimal("0.15")


def calculate_monthly_payment(amount: Decimal, annual_interest_rate: Decimal, months: int) -> Decimal:
    """Calculates a fair monthly repayment using Simple Interest logic."""
    d_amount = Decimal(str(amount))
    rate_decimal = Decimal(str(annual_interest_rate)) / Decimal("100")
    total_to_pay = d_amount + (d_amount * rate_decimal)
    monthly_payment = total_to_pay / Decimal(str(months))
    return monthly_payment.quantize(Decimal("0.01"))


def _add_months(dt: datetime, months: int) -> datetime:
    """Add exact calendar months to a datetime (handles month-end edge cases)."""
    import calendar
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def generate_loan_repayment_schedule(db: Session, loan: models.Loan, base_dt: datetime = None):
    """Generates the full list of installments.

    base_dt = the loan's creation/applied date (use loan.created_at).
    If not passed, falls back to now (for brand-new loans just being created).

    Due date rules:
      - Normal loan (Production / Post-Production / Distribution & Marketing):
        First payment = base_dt + 1 exact calendar month.
        Every subsequent installment = +1 more calendar month.
        On each due date the user must pay. They can use a delay request to
        extend that specific installment by +15 days, but all other due dates
        stay fixed.

      - Grace loan (Development / Pre-Production):
        The schedule always starts at base_dt + 1 month (NOT +3 months).
        Months 1, 2, 3 → status='grace_update' rows: no payment, but user
        MUST submit a monthly update each month.
        If the user FAILS a monthly update, the sweep gives them 10 days to
        pay; if they still don't, the 3-month grace rule is disabled for that
        loan (grace_months_remaining set to 0) and the loan becomes due.
        If ALL 3 monthly updates are approved, the schedule gains 3 extra
        months appended after the last repayment installment.
        Months 4 onwards → actual repayment installments.
    """
    # ── Determine production phase from project_description (canonical source) ──
    desc = (getattr(loan, 'project_description', '') or '')
    m = re.search(r'Phase:\s*([^|]+)', desc, re.IGNORECASE)
    display_phase = m.group(1).strip().lower() if m else ''

    if not display_phase:
        stage = (getattr(loan, 'current_stage', '') or '').lower()
        _stage_map = {
            'pre_production': 'pre-production',
            'development': 'development',
            'production': 'production',
            'post_production': 'post-production',
            'distribution': 'distribution & marketing',
        }
        display_phase = _stage_map.get(stage, stage.replace('_', '-'))

    GRACE_LABELS = {'pre-production', 'development'}
    NORMAL_LABELS = {'production', 'post-production', 'post production',
                     'distribution & marketing', 'distribution and marketing'}

    grace_phase = display_phase in GRACE_LABELS
    if display_phase not in GRACE_LABELS and display_phase not in NORMAL_LABELS:
        grace_phase = False

    # ── Base date: use loan's created_at if available, else now ──
    if base_dt is None:
        base_dt = getattr(loan, 'created_at',
                          None) or datetime.now(timezone.utc)
    if base_dt.tzinfo is None:
        base_dt = base_dt.replace(tzinfo=timezone.utc)

    # ── Set grace metadata on loan ──
    if grace_phase:
        if hasattr(loan, 'grace_months_granted'):
            loan.grace_months_granted = 3
        if hasattr(loan, 'grace_months_remaining'):
            loan.grace_months_remaining = 3
    else:
        if hasattr(loan, 'grace_months_granted'):
            loan.grace_months_granted = 0
        if hasattr(loan, 'grace_months_remaining'):
            loan.grace_months_remaining = 0

    if grace_phase:
        # Months 1-3: monthly update tracking rows (status='grace_update')
        # First due = base_dt + 1 month (next calendar month from approval)
        for grace_i in range(1, 4):
            grace_due = _add_months(base_dt, grace_i)
            db.add(models.LoanSchedule(
                loan_id=loan.id,
                installment_number=grace_i,
                due_date=grace_due,
                amount_due=loan.monthly_payment,
                status="grace_update"
            ))

        # Repayment starts at month 4 (base_dt + 4, +5, +6, ...)
        # grace rows use months 1-3, so repayment installment #1 = base_dt + 4 months
        for i in range(1, loan.duration_months + 1):
            due_date = _add_months(base_dt, 3 + i)
            db.add(models.LoanSchedule(
                loan_id=loan.id,
                installment_number=i + 3,
                due_date=due_date,
                amount_due=loan.monthly_payment,
                status="unpaid"
            ))

        loan.next_payment_due = _add_months(base_dt, 1)

    else:
        # Normal loan: first due = base_dt + 1 month (next calendar month)
        for i in range(1, loan.duration_months + 1):
            due_date = _add_months(base_dt, i)
            db.add(models.LoanSchedule(
                loan_id=loan.id,
                installment_number=i,
                due_date=due_date,
                amount_due=loan.monthly_payment,
                status="unpaid"
            ))
        loan.next_payment_due = _add_months(base_dt, 1)

    db.commit()


def apply_late_penalty_logic(db: Session, loan: models.Loan, user: models.User):
    """
    🛡️ RISK MANAGEMENT: Applies a 2% penalty on the remaining balance.
    """
    now = datetime.now(timezone.utc)

    if loan.is_on_production_break or user.account_status != "active":
        return Decimal("0.00")

    if loan.last_penalty_calculation and loan.last_penalty_calculation.date() == now.date():
        return Decimal("0.00")

    if loan.next_payment_due and now > loan.next_payment_due.replace(tzinfo=timezone.utc):
        db.refresh(loan, with_for_update=True)

        penalty = (loan.remaining_amount * Decimal("0.02")
                   ).quantize(Decimal("0.01"))

        # UPDATE LOAN
        loan.remaining_amount += penalty
        loan.total_penalty_paid += penalty
        loan.is_overdue = True
        loan.missed_payments_count += 1
        loan.last_penalty_calculation = now

        # --- MODIFIED SECTION ---
        # REMOVED: user.trust_score = max(0, user.trust_score - 15)
        # ADDED: Centralized trust handling
        TrustService.apply_late_penalty(db, user)

        # AUDIT & TRANSACTION
        penalty_tx = models.Transaction(
            loan_id=loan.id,
            amount=penalty,
            transaction_type="penalty_fee",
            reference_number=f"PNL-{loan.id}-{now.strftime('%y%m%d')}"
        )
        db.add(penalty_tx)

        if loan.missed_payments_count >= 3:
            loan.status = "defaulted"
            user.account_status = "frozen"

        db.commit()
        return penalty

    return Decimal("0.00")


def validate_project_link(url: str) -> bool:
    if not url:
        return True
    url_pattern = re.compile(r'^https?://', re.IGNORECASE)
    return re.match(url_pattern, url) is not None
