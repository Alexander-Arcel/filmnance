"""
Background sweep for the Delay / Monthly-Update Rule Engine.

Called periodically (every few hours) by core/scheduler.py. Walks every
unpaid installment on every disbursed loan and applies whichever
time-based rule currently matches its state:

  1. Warning trigger — 3 days before due, if neither a delay request nor a
     monthly update is on file for this installment, send a one-time
     warning notification.
  2. Admin-inaction escalation — a delay or monthly-update request has sat
     "pending" for more than ADMIN_GRACE_DAYS since it was submitted ->
     push the WHOLE remaining schedule forward by 1 day per sweep run
     while it stays unresolved, escalating the longer the admin waits.
  3. Pure non-response penalty — installment is overdue, the warning has
     fully elapsed, and the producer never submitted ANY request -> -2
     trust every 3 days, plus a one-time +5 interest surcharge the first
     time this is detected.

This function is intentionally defensive (try/except per-loan) so one bad
record can't halt the sweep for everyone else.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models import models
from backend.services import delay_engine as engine

logger = logging.getLogger(__name__)


def _notify(db: Session, user_id: int, title: str, message: str):
    db.add(models.Notification(user_id=user_id, title=title, message=message))


def run_sweep(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    stats = {
        "warnings_sent": 0,
        "schedules_pushed": 0,
        "non_response_penalties": 0,
        "surcharges_applied": 0,
        "loans_scanned": 0,
        "errors": 0,
    }

    loans = db.query(models.Loan).filter(
        models.Loan.status == "disbursed").all()

    for loan in loans:
        try:
            stats["loans_scanned"] += 1
            owner = loan.owner
            if not owner:
                continue

            needs_push = False

            for sched in loan.repayment_schedule:
                if sched.status == "paid":
                    continue

                # ── 0. Grace-policy month passed its due date unattended ──
                if sched.status == "grace_update":
                    due_g = engine._aware(sched.due_date)
                    if due_g and now > due_g and sched.monthly_update_status != "approved":
                        result = engine.fail_grace_month(db, loan, sched)
                        if result.get("failed"):
                            _notify(
                                db, owner.id,
                                "⚠️ Monthly Update Missed",
                                f"You did not get an approved monthly update for "
                                f"installment #{sched.installment_number} on "
                                f"'{loan.project_title}' before its due date. "
                                f"You now have {engine.GRACE_FAIL_PAY_WINDOW_DAYS} days "
                                f"to pay this installment directly, and your 3-month "
                                f"grace policy for this loan has been disabled."
                            )
                    continue

                due = engine._aware(sched.due_date)
                if not due:
                    continue

                has_delay_request = sched.delay_status == "pending"
                has_monthly_request = sched.monthly_update_status == "pending"

                # ── 1. Send the 3-day warning once ──────────────────────
                if engine.schedule_in_warning_window(sched, now) and not sched.warning_sent_at:
                    sched.warning_sent_at = now
                    _notify(
                        db, owner.id,
                        "⏰ Payment Due Soon — Action Needed",
                        f"Installment #{sched.installment_number} for '{loan.project_title}' "
                        f"is due on {due.strftime('%b %d, %Y')}. Submit a Delay Request or "
                        f"Monthly Update within the next 3 days to avoid penalties."
                    )
                    stats["warnings_sent"] += 1

                # ── 2. Admin-inaction escalation for pending requests ───
                pending_since = None
                if has_delay_request and sched.delay_requested_at:
                    pending_since = engine._aware(sched.delay_requested_at)
                elif has_monthly_request and sched.monthly_update_requested_at:
                    pending_since = engine._aware(
                        sched.monthly_update_requested_at)

                if pending_since:
                    days_pending = (now - pending_since).days
                    if days_pending > engine.ADMIN_GRACE_DAYS:
                        needs_push = True

                # ── 3. Pure non-response path (nothing on file at all) ──
                if (not has_delay_request and not has_monthly_request
                        and sched.delay_status != "approved"
                        and sched.monthly_update_status != "approved"):
                    days_overdue = engine.days_since_warning_expired(
                        sched, now)
                    if days_overdue >= 3:
                        if not sched.warning_penalty_applied:
                            engine.TrustService.apply_no_warning_response_penalty(
                                db, owner)
                            sched.warning_penalty_applied = True
                            stats["non_response_penalties"] += 1
                            engine.TrustService.apply_overdue_interest_surcharge(
                                db, loan)
                            stats["surcharges_applied"] += 1
                        elif days_overdue % 3 == 0:
                            # Reapply the -2 penalty every 3 days it remains
                            # unresolved (surcharge is one-time only).
                            engine.TrustService.apply_no_warning_response_penalty(
                                db, owner)
                            stats["non_response_penalties"] += 1

            if needs_push:
                # Push the whole remaining schedule forward by 1 day per
                # sweep run while admin inaction continues — this makes the
                # schedule escalate the longer the admin waits, exactly as
                # described, without double-counting across sweep runs.
                pushed = engine.push_schedule_forward(db, loan, 1)
                if pushed:
                    stats["schedules_pushed"] += pushed

        except Exception as e:
            stats["errors"] += 1
            logger.error(f"Delay sweep failed for loan {loan.id}: {e}")
            db.rollback()
            continue

    db.commit()
    return stats
