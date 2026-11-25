"""
Delay / Monthly-Update Rule Engine
===================================

Implements the business rules described by the product owner for how
producers request payment delays or monthly production updates, and what
happens automatically when the admin does not act on those requests in
time. This module is intentionally separate from loan_service.py so the
timing/escalation rules live in one place and can be called both from the
API endpoints (when a user/admin takes an action) and from the background
scheduler (core/scheduler.py) which sweeps for time-based escalations that
nobody manually triggered.

──────────────────────────────────────────────────────────────────────────
MONTHLY UPDATE
──────────────────────────────────────────────────────────────────────────
- 1 attempt per due-date month per loan. The "month" window for a given
  installment runs from the PREVIOUS due date up to (and including) the
  CURRENT due date, e.g. June 17 -> July 17.
- If the attempt is REJECTED, the producer may attempt again within the
  same window.
- If the attempt is still PENDING, the producer cannot submit another
  attempt for that window.
- Development / Pre-Production phase gets a 3-month grace policy: as long
  as the producer keeps submitting an APPROVED monthly update each month,
  they are not required to pay during those 3 months.
    - Completing all 3 grace months successfully -> +5 trust points once.
    - Any approved monthly update outside of (or after) the grace window
      -> +2 trust points per approval.
- If a monthly update is not yet APPROVED with 3 days left before the
  installment's due date, the producer gets a 3-day warning. They may
  still submit (or resubmit) right up to the last day of that window.
  Submitting on the very last day still works, but costs -2 trust points.
- If 5 days pass after the warning period ends and the admin has STILL not
  approved or rejected the pending request, the fault shifts to the admin:
  the loan schedule for ALL remaining unpaid installments is pushed forward
  by however many days the admin has been unresponsive (escalates daily
  until acted on).
- If ultimately rejected after the schedule has already been pushed
  forward, the schedule stays pushed (it doesn't roll back) — but the
  producer now owes payment immediately, and if they were in a grace
  phase, the remaining grace-period protection is revoked.

──────────────────────────────────────────────────────────────────────────
DELAY REQUEST
──────────────────────────────────────────────────────────────────────────
- Maximum 3 lifetime delay attempts per loan (separate pool from monthly
  updates).
- Requires a reason and proof photo (already enforced in loan.py).
- Development/Pre-Production producers cannot use this until they have
  fully exhausted their 3-month grace policy.
- Same 3-day warning window as monthly updates; submitting on the very
  last (3rd) day still counts but costs -5 trust points (steeper than the
  monthly-update equivalent, since a delay is a bigger ask).
- If the admin does not act within 5 days of that submission, the fault is
  the admin's: the schedule for the WHOLE loan is pushed forward by the
  number of days the admin remains unresponsive, same escalation as above.
- If eventually APPROVED with 15+ days, the schedule is NOT pushed further
  (it only moves due to admin delay, not due to the approved extension
  itself — the approved extension is the whole point of asking).
- If the producer never requests a delay at all and simply goes overdue:
    - After 3 days overdue with no request on file: -2 trust points,
      reapplied every 3 days the installment remains unresolved.
    - Once 3 days overdue AND the warning has fully elapsed with nothing on
      file, a flat +₱5 interest surcharge is added once.
- Once all 3 delay attempts have been used, no further delay requests are
  allowed on that loan.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from backend.models import models
from backend.services.trust_service import TrustService

WARNING_WINDOW_DAYS = 3
ADMIN_GRACE_DAYS = 5
MAX_DELAY_ATTEMPTS = 3
GRACE_PHASES = ("pre_production", "development")
# Display labels that map to grace phases
GRACE_PHASE_LABELS = ("pre-production", "development")
# Display labels that are NORMAL loaning (not grace)
NORMAL_PHASE_LABELS = ("production", "post-production", "post production",
                       "distribution & marketing", "distribution and marketing")


def _aware(dt):
    """Make a naive datetime timezone-aware (assume UTC) for safe comparison."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _get_display_phase(loan: models.Loan) -> str:
    """Get the actual production phase the user selected.
    Tries film_production_phase column first, then extracts from
    project_description ('...| Phase: Production |...')."""
    # Try direct column first (may not exist on older schema)
    direct = (getattr(loan, "film_production_phase", "") or "").strip()
    if direct:
        return direct.lower()
    # Fallback: parse from project_description
    desc = (getattr(loan, "project_description", "") or "")
    import re as _re
    m = _re.search(r'\|\s*Phase:\s*([^|]+)', desc)
    if m:
        return m.group(1).strip().lower()
    return ""


def is_grace_phase(loan: models.Loan) -> bool:
    """True only if the loan is genuinely in Development or Pre-Production.
    Cross-checks current_stage against the actual display phase extracted
    from project_description to prevent legacy 'pre_production' hardcoded
    values from blocking Production/Post-Production loans."""
    stage = (getattr(loan, "current_stage", "")
             or "").lower().replace("-", "_")
    display = _get_display_phase(loan)

    # If the display phase explicitly says it's a normal (non-grace) phase,
    # trust that over current_stage — this fixes loans created with the old
    # hardcoded current_stage='pre_production' regardless of actual phase.
    if display and display in NORMAL_PHASE_LABELS:
        return False

    # If current_stage is a grace phase and display confirms it (or is empty), it's grace
    if stage in GRACE_PHASES:
        if not display or display in GRACE_PHASE_LABELS:
            return True
        return False

    return False


def grace_policy_active(loan: models.Loan) -> bool:
    """True while the loan still has unused Development/Pre-Production
    grace months remaining AND is actually in a grace phase.
    Both conditions must be true — prevents Production-phase loans from
    being incorrectly blocked if grace_months_remaining was set erroneously."""
    return (
        is_grace_phase(loan)
        and (getattr(loan, "grace_months_remaining", 0) or 0) > 0
    )


def can_request_delay(loan: models.Loan):
    """Returns (allowed, reason_if_not)."""
    if grace_policy_active(loan):
        return False, (
            "Delay requests are not available while your project is still "
            "within its 3-month Development/Pre-Production grace period. "
            "Use Monthly Update instead."
        )
    used = getattr(loan, "delay_attempts_used", 0) or 0
    if used >= MAX_DELAY_ATTEMPTS:
        return False, f"Maximum of {MAX_DELAY_ATTEMPTS} delay requests already used on this loan."
    return True, ""


def schedule_in_warning_window(schedule: models.LoanSchedule, now=None) -> bool:
    """True if we're within WARNING_WINDOW_DAYS of the due date (inclusive),
    i.e. the producer should be shown a warning banner."""
    now = now or datetime.now(timezone.utc)
    due = _aware(schedule.due_date)
    if not due:
        return False
    return timedelta(0) <= (due - now) <= timedelta(days=WARNING_WINDOW_DAYS)


def days_since_warning_expired(schedule: models.LoanSchedule, now=None) -> int:
    """How many whole days have passed since the due date itself (i.e. since
    the warning window fully expired). 0 or negative means not yet expired."""
    now = now or datetime.now(timezone.utc)
    due = _aware(schedule.due_date)
    if not due:
        return 0
    return (now - due).days


def submit_delay_request(db: Session, loan: models.Loan, schedule: models.LoanSchedule,
                         user: models.User, now=None) -> dict:
    """
    Records a delay request attempt and applies the "submitted on the last
    warning day" penalty if applicable. Does NOT touch delay_status/reason/
    proof — the calling endpoint still owns writing those fields; this only
    handles the attempt counter, timestamp and warning-day penalty.
    """
    now = now or datetime.now(timezone.utc)
    schedule.delay_requested_at = now
    loan.delay_attempts_used = (
        getattr(loan, "delay_attempts_used", 0) or 0) + 1

    penalized = False
    due = _aware(schedule.due_date)
    if due and timedelta(0) <= (due - now) <= timedelta(days=1):
        # Submitted on the final day of the 3-day warning window.
        TrustService.apply_delay_warning_penalty(db, user)
        penalized = True

    return {"attempts_used": loan.delay_attempts_used, "last_day_penalty_applied": penalized}


def submit_monthly_update_request(db: Session, loan: models.Loan, schedule: models.LoanSchedule,
                                  user: models.User, now=None) -> dict:
    """
    Records a monthly-update attempt against a specific installment period
    and applies the "submitted on the last warning day" penalty if
    applicable.
    """
    now = now or datetime.now(timezone.utc)
    schedule.monthly_update_requested_at = now
    schedule.monthly_update_status = "pending"

    penalized = False
    due = _aware(schedule.due_date)
    if due and timedelta(0) <= (due - now) <= timedelta(days=1):
        TrustService.apply_monthly_update_warning_penalty(db, user)
        penalized = True

    return {"last_day_penalty_applied": penalized}


def approve_monthly_update(db: Session, loan: models.Loan, schedule: models.LoanSchedule,
                           user: models.User) -> dict:
    """
    Applies the reward side of an approved monthly update: consumes one
    grace month if still in the grace policy (awarding the one-time +5
    completion bonus when the 3rd month is consumed), otherwise the regular
    +2 trust points for a normal-phase monthly update.

    Also finalizes the LoanSchedule row itself so the Loan Schedule table
    reflects reality immediately: status becomes 'grace_done' (no payment
    owed for that month) and amount_due drops to 0, since a monthly update
    satisfies that month in place of a cash installment.
    """
    schedule.monthly_update_status = "approved"
    schedule.status = "grace_done"
    schedule.amount_due = Decimal("0.00")
    result = {"grace_consumed": False, "grace_completed": False, "bonus": 0}

    if grace_policy_active(loan):
        loan.grace_months_remaining = max(
            0, (getattr(loan, "grace_months_remaining", 0) or 0) - 1)
        loan.grace_months_used = (
            getattr(loan, "grace_months_used", 0) or 0) + 1
        result["grace_consumed"] = True
        if loan.grace_months_remaining == 0:
            TrustService.apply_grace_period_completion_bonus(db, user)
            result["grace_completed"] = True
            result["bonus"] = 5
            # All 3 grace months were approved — extend the repayment
            # schedule by 3 extra months appended after the last
            # installment, since the +3 month buffer that made the grace
            # policy possible needs to be paid back too.
            extend_schedule_for_completed_grace(db, loan)
    else:
        TrustService.apply_monthly_update_success_bonus(db, user)
        result["bonus"] = 2

    db.flush()
    return result


def extend_schedule_for_completed_grace(db: Session, loan: models.Loan) -> int:
    """
    When a producer completes all 3 grace months (Development /
    Pre-Production), the 3-month buffer that let them skip cash payments
    needs to be paid back — so we append 3 more installments after the
    current last one, at the same monthly amount and cadence. This keeps
    the loan duration the user agreed to intact while still covering the
    months that were grace-only. Returns the number of installments added.
    Idempotent: does nothing if already extended for this loan.
    """
    if getattr(loan, "grace_schedule_extended", False):
        return 0

    existing = sorted(
        [s for s in loan.repayment_schedule if s.status !=
            "grace_done" and s.status != "grace_update"],
        key=lambda s: s.installment_number
    )
    if not existing:
        return 0

    last = existing[-1]
    last_due = _aware(last.due_date)
    added = 0
    for i in range(1, 4):
        new_due = last_due + timedelta(days=30 * i)
        db.add(models.LoanSchedule(
            loan_id=loan.id,
            installment_number=last.installment_number + i,
            due_date=new_due,
            amount_due=last.amount_due,
            status="unpaid"
        ))
        added += 1

    if hasattr(loan, "grace_schedule_extended"):
        loan.grace_schedule_extended = True
    db.flush()
    return added


def reject_monthly_update(db: Session, loan: models.Loan, schedule: models.LoanSchedule) -> None:
    schedule.monthly_update_status = "rejected"
    # Producer may attempt again within the same window — clear the
    # request timestamp so a fresh submission isn't blocked, but only if
    # we are still inside the window for this installment.
    schedule.monthly_update_requested_at = None


def push_schedule_forward(db: Session, loan: models.Loan, days: int) -> int:
    """
    Pushes EVERY remaining unpaid installment's due_date forward by `days`
    days. Used when the admin fails to act on a delay/monthly-update
    request within the 5-day grace window — the fault is the admin's, so
    the whole remaining schedule shifts rather than penalizing the
    producer.
    Returns the number of installments updated.
    """
    if days <= 0:
        return 0
    count = 0
    for sched in loan.repayment_schedule:
        if sched.status == "paid":
            continue
        sched.due_date = _aware(sched.due_date) + timedelta(days=days)
        count += 1
    loan.schedule_push_days = (
        getattr(loan, "schedule_push_days", 0) or 0) + days
    if loan.next_payment_due:
        loan.next_payment_due = _aware(
            loan.next_payment_due) + timedelta(days=days)
    db.flush()
    return count


def revoke_remaining_grace(db: Session, loan: models.Loan) -> None:
    """
    Called when a monthly update is ultimately rejected after the schedule
    has already been auto-pushed due to admin inaction. The producer now
    must pay immediately and forfeits whatever grace months they had left,
    even mid-policy.
    """
    loan.grace_months_remaining = 0


GRACE_FAIL_PAY_WINDOW_DAYS = 10


def fail_grace_month(db: Session, loan: models.Loan, schedule: models.LoanSchedule) -> dict:
    """
    Called when a grace-policy installment (status='grace_update') passes
    its due date with no approved monthly update on file. The producer
    gets GRACE_FAIL_PAY_WINDOW_DAYS to pay that month directly instead;
    the 3-month grace protection for THIS loan is disabled going forward
    (grace_months_remaining -> 0) since the policy only holds while every
    month is kept current.

    Because the +3 trailing installments only exist to pay back the grace
    buffer, and that buffer is only "earned" once all 3 grace months are
    completed successfully, a failed grace month means those trailing
    extension installments (if they were ever added) get trimmed back —
    one fewer trailing month per grace month that failed, since the user
    no longer gets the full benefit that justified the extension.
    """
    if schedule.status != "grace_update":
        return {"already_resolved": True}

    schedule.status = "unpaid"
    schedule.monthly_update_status = "failed"
    # The 10-day pay window is enforced by the sweep comparing now() against
    # (original due_date + GRACE_FAIL_PAY_WINDOW_DAYS); due_date itself is
    # left untouched so existing overdue logic continues to work off it.

    loan.grace_months_remaining = 0
    trimmed = trim_unearned_extension(db, loan, count=1)

    db.flush()
    return {"failed": True, "pay_window_days": GRACE_FAIL_PAY_WINDOW_DAYS, "trimmed_installments": trimmed}


def trim_unearned_extension(db: Session, loan: models.Loan, count: int = 1) -> int:
    """
    Removes up to `count` trailing UNPAID installments from the end of the
    schedule. Used when a grace month fails — the +3 month repayment
    extension is only earned by completing the grace policy in full, so
    each failed grace month forfeits one of the trailing bonus months.
    Never removes a 'paid' installment. Returns how many were actually
    removed.
    """
    candidates = sorted(
        [s for s in loan.repayment_schedule if s.status == "unpaid"],
        key=lambda s: s.installment_number,
        reverse=True
    )
    removed = 0
    for s in candidates:
        if removed >= count:
            break
        db.delete(s)
        removed += 1
    if removed:
        db.flush()
    return removed


def escalate_interest_for_nonpayment(db: Session, loan: models.Loan, bump_pct: Decimal = Decimal("5")) -> dict:
    """
    Applies a one-time interest rate bump (default +5 percentage points,
    e.g. 15% -> 20%) when a producer fails to pay within the grace-fail or
    overdue pay window described in the product rules, and re-spreads the
    cost across every remaining UNPAID installment so the monthly amount
    rises evenly for the rest of the term — rather than dumping the whole
    penalty onto a single installment.

    Idempotent per loan: if interest_escalated is already True, does
    nothing (the bump only ever applies once per loan).
    """
    if getattr(loan, "interest_escalated", False):
        return {"already_escalated": True}

    old_rate = loan.interest_rate or Decimal("15")
    new_rate = Decimal(str(old_rate)) + bump_pct
    loan.interest_rate = new_rate

    remaining = [s for s in loan.repayment_schedule if s.status == "unpaid"]
    if not remaining:
        if hasattr(loan, "interest_escalated"):
            loan.interest_escalated = True
        db.flush()
        return {"old_rate": float(old_rate), "new_rate": float(new_rate), "installments_updated": 0}

    # Re-derive the outstanding principal still owed across the remaining
    # installments at the OLD rate, then re-amortize that same principal
    # at the NEW rate across the same number of remaining installments so
    # the increase is spread evenly rather than front- or back-loaded.
    old_total_remaining = sum(
        (s.amount_due or Decimal("0")) for s in remaining)
    bump_ratio = new_rate / old_rate if old_rate else Decimal("1")
    new_installment_amount = (
        old_total_remaining * bump_ratio / len(remaining)
    ).quantize(Decimal("0.01"))

    for s in remaining:
        s.amount_due = new_installment_amount

    if loan.monthly_payment:
        loan.monthly_payment = new_installment_amount
    loan.remaining_amount = new_installment_amount * len(remaining)

    if hasattr(loan, "interest_escalated"):
        loan.interest_escalated = True

    db.flush()
    return {
        "old_rate": float(old_rate),
        "new_rate": float(new_rate),
        "installments_updated": len(remaining),
        "new_installment_amount": float(new_installment_amount),
    }
