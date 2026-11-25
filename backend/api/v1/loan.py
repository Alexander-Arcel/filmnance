from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models import models
from backend.models.schemas import user_schemas
from backend.services import loan_service
from backend.services import delay_engine as engine
from backend.core.security import get_current_user, get_current_admin, verify_transaction_auth
from backend.services.audit_service import log_action
from decimal import Decimal

router = APIRouter(prefix="/loans", tags=["Loans"])

# ── Philippine Payment Methods ─────────────────────────────────────────────────

PH_PAYMENT_METHODS = [
    {"key": "gcash",      "label": "GCash",               "type": "ewallet"},
    {"key": "maya",       "label": "Maya (PayMaya)",       "type": "ewallet"},
    {"key": "grabpay",    "label": "GrabPay",              "type": "ewallet"},
    {"key": "shopeepay",  "label": "ShopeePay",            "type": "ewallet"},
    {"key": "coins_ph",   "label": "Coins.ph",             "type": "ewallet"},
    {"key": "bdo",        "label": "BDO",                  "type": "bank"},
    {"key": "bpi",        "label": "BPI",                  "type": "bank"},
    {"key": "metrobank",  "label": "Metrobank",            "type": "bank"},
    {"key": "unionbank",  "label": "UnionBank",            "type": "bank"},
    {"key": "landbank",   "label": "Landbank",             "type": "bank"},
    {"key": "pnb",        "label": "PNB",                  "type": "bank"},
    {"key": "rcbc",       "label": "RCBC",                 "type": "bank"},
    {"key": "eastwest",   "label": "EastWest Bank",        "type": "bank"},
    {"key": "chinabank",  "label": "China Bank",           "type": "bank"},
    {"key": "psbank",     "label": "PSBank",               "type": "bank"},
    {"key": "cebuana",    "label": "Cebuana Lhuillier",    "type": "remittance"},
    {"key": "palawan",    "label": "Palawan Pawnshop",     "type": "remittance"},
]


@router.get("/ph-payment-methods")
def get_ph_payment_methods():
    return PH_PAYMENT_METHODS


# --- 0. PAYMENT METHODS ---

@router.get("/payment-methods")
def get_payment_methods(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    methods = db.query(models.PaymentMethod).filter(
        models.PaymentMethod.owner_id == current_user.id
    ).order_by(models.PaymentMethod.is_default.desc(), models.PaymentMethod.created_at.desc()).all()
    return methods


@router.post("/payment-methods")
def create_payment_method(
    method_data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    method_type = method_data.get("method_type")
    account_name = method_data.get("account_name")
    account_number = method_data.get("account_number")
    is_default = method_data.get("is_default", False)

    if not all([method_type, account_name, account_number]):
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: method_type, account_name, account_number"
        )

    if is_default:
        db.query(models.PaymentMethod).filter(
            models.PaymentMethod.owner_id == current_user.id,
            models.PaymentMethod.id != (method_data.get("id") or 0)
        ).update({"is_default": False})

    new_method = models.PaymentMethod(
        owner_id=current_user.id,
        method_type=method_type,
        account_name=account_name,
        account_number=account_number,
        is_default=is_default
    )
    db.add(new_method)
    db.commit()
    db.refresh(new_method)
    return new_method


@router.delete("/payment-methods/{method_id}")
def delete_payment_method(
    method_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    method = db.query(models.PaymentMethod).filter(
        models.PaymentMethod.id == method_id,
        models.PaymentMethod.owner_id == current_user.id
    ).first()
    if not method:
        raise HTTPException(
            status_code=404, detail="Payment method not found.")
    db.delete(method)
    db.commit()
    return {"message": "Payment method removed."}

# --- RECEIPTS ---


def _build_receipts(loan_id: int, db: Session):
    disb_receipts = db.query(models.DisbursementReceipt).filter(
        models.DisbursementReceipt.loan_id == loan_id
    ).all() or []
    repay_receipts = db.query(models.RepaymentReceipt).filter(
        models.RepaymentReceipt.loan_id == loan_id
    ).all() or []

    receipts = []
    for r in disb_receipts:
        receipts.append({
            "id": r.id,
            "type": "disbursement",
            "reference": r.reference_number,
            "amount": float(r.amount),
            "method": r.method,
            "account_name": r.account_name,
            "date": r.created_at.isoformat() if r.created_at else None,
        })
    for r in repay_receipts:
        receipts.append({
            "id": r.id,
            "type": "repayment",
            "reference": r.reference_number,
            "amount": float(r.amount),
            "method": r.method,
            "status": r.status,
            "date": r.confirmed_at.isoformat() if r.confirmed_at else (
                r.submitted_at.isoformat() if r.submitted_at else None),
        })
    return receipts


@router.get("/{loan_id}/receipts")
def get_loan_receipts(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """All receipts for a loan — accessible by the loan owner."""
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    return _build_receipts(loan_id, db)


@router.get("/admin/loans/{loan_id}/receipts")
def get_admin_loan_receipts(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    """Admin view of all receipts for any loan."""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    return _build_receipts(loan_id, db)


# --- 1. LOAN CALCULATION ---

@router.get("/calculate")
def get_loan_calculation(
    amount: float,
    months: int,
    current_user: models.User = Depends(get_current_user)
):
    rate = loan_service.get_interest_rate_by_trust_score(
        current_user.trust_score)
    monthly = loan_service.calculate_monthly_payment(
        Decimal(str(amount)), rate * 100, months)
    total_repayment = monthly * months
    return {
        "applied_rate": float(rate),
        "monthly_payment": round(float(monthly), 2),
        "total_repayment": round(float(total_repayment), 2),
        "currency": "PHP",
        "trust_score_benefit": "Gold Rate (10%)" if rate == Decimal("0.10") else "Standard Rate (15%)"
    }


# --- 2. PURPOSE SELECTION ---

@router.post("/validate-purposes", response_model=user_schemas.LoanPurposeSelection)
def validate_loan_purposes(
    selection: user_schemas.LoanPurposeSelection,
    current_user: models.User = Depends(get_current_user)
):
    has_other = any(
        p == user_schemas.LoanPurpose.OTHER for p in selection.list)
    if has_other and not selection.purpose:
        raise HTTPException(
            status_code=400,
            detail="If 'Other' is selected, please provide a breakdown in the purpose field."
        )
    return selection


# --- 3. LOAN APPLICATION ---

@router.post("/apply")
def apply_for_loan(
    request: Request,
    loan_in: dict,
    transaction_pin: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    project_title = loan_in.get('project_title')
    amount = Decimal(str(loan_in.get('amount', 0)))
    duration_months = int(loan_in.get('duration_months', 12))
    purposes = loan_in.get('purposes', [])
    current_stage = loan_in.get('current_stage', 'pre_production')
    film_details = loan_in.get('film_details', {})
    # FIX: project_description from frontend is the USER's written description
    # We store it in loan.purpose so it's always retrievable as plain text
    project_description = loan_in.get('project_description') or ''
    script_url = loan_in.get('script_url')
    lookbook_url = loan_in.get('lookbook_url')
    trailer_url = loan_in.get('trailer_url')
    disb_method = loan_in.get(
        'loanDisbMethod') or loan_in.get('disbursement_method')
    disb_account = loan_in.get(
        'loanDisbAccount') or loan_in.get('disbursement_account')

    # Collect ALL genres from the hidden input (comma-separated)
    raw_genre = loan_in.get(
        'all_genres') or film_details.get('genre', '') or ''
    all_genres_list = [g.strip() for g in raw_genre.split(',') if g.strip()]
    all_genres = ', '.join(all_genres_list) if all_genres_list else 'Drama'
    # Production phase and budget categories
    film_production_phase = loan_in.get('film_production_phase') or ''
    raw_budget = loan_in.get('purposes') or loan_in.get(
        'budget_categories') or []
    budget_cats = ', '.join(raw_budget) if isinstance(
        raw_budget, list) else str(raw_budget)

    if not project_title or amount <= 0:
        raise HTTPException(
            status_code=400, detail="Title and valid amount required.")
    if not current_user.is_verified:
        raise HTTPException(
            status_code=403, detail="Identity not verified. Please complete KYC verification first.")
    if current_user.account_status != "active":
        raise HTTPException(status_code=403, detail="Account restricted.")

    verify_transaction_auth(transaction_pin, current_user, db)

    existing = db.query(models.Loan).filter(
        models.Loan.owner_id == current_user.id,
        models.Loan.status.in_(["pending", "approved", "disbursed"])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Active loan exists.")

    rate = loan_service.get_interest_rate_by_trust_score(
        current_user.trust_score)
    monthly = loan_service.calculate_monthly_payment(
        amount, float(rate * 100), duration_months)
    total = monthly * duration_months
    is_pre_production = current_stage in ('pre_production', 'development')

    new_loan = models.Loan(
        project_title=project_title,
        amount=float(amount),
        duration_months=duration_months,
        requirements_list=purposes,
        # FIX: store user's written description in purpose field
        purpose=project_description or None,
        current_stage=current_stage,
        script_url=script_url,
        lookbook_url=lookbook_url,
        trailer_url=trailer_url,
        # project_description stores Genre + Location + Phase + Budget metadata
        project_description=f"Genre: {all_genres} | Location: {film_details.get('shooting_location', 'Philippines')} | Phase: {film_production_phase} | Budget: {budget_cats}",
        remaining_amount=float(total),
        interest_rate=float(rate),
        monthly_payment=float(monthly),
        disbursement_method=disb_method or "pending",
        disbursement_account=disb_account or "TBD",
        owner_id=current_user.id,
        status="pending",
    )
    # Grace period for pre-production (3 months, submitted via monthly updates)
    if hasattr(new_loan, 'grace_months_remaining'):
        new_loan.grace_months_remaining = 3 if is_pre_production else 0
    if hasattr(new_loan, 'is_on_production_break'):
        new_loan.is_on_production_break = is_pre_production

    db.add(new_loan)
    db.commit()
    db.refresh(new_loan)
    # Audit log: user requested a loan
    try:
        _term_years = duration_months // 12
        _term_months = duration_months % 12
        _term_str = (f"{_term_years}y " if _term_years else "") + \
            (f"{_term_months}m" if _term_months else "")
        log_action(db, admin_id=current_user.id, action="LOAN_REQUEST",
                   ip=request.client.host,
                   target_id=new_loan.id,
                   details={
                       "title": project_title or "—",
                       "production_phase": film_production_phase or "Pre-Production",
                       "term": _term_str.strip() or f"{duration_months}m",
                       "user": current_user.name or current_user.email
                   })
    except Exception:
        pass
    return new_loan


# --- 4. OVERDUE CHECK ---

@router.post("/check-overdue/{loan_id}")
def check_loan_status(loan_id: int, db: Session = Depends(get_db)):
    from backend.services.trust_service import TrustService
    from datetime import timedelta
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.is_on_production_break:
        return {"status": "Protected by Production Break shield."}

    now = datetime.now(timezone.utc)
    GRACE_DAYS = 3
    penalty_applied = False

    # Check each unpaid installment — apply delay-failure penalty if past grace
    for sched in loan.repayment_schedule:
        if sched.status == "paid":
            continue
        if sched.delay_status in ("pending", "approved"):
            continue  # delay request is active — protected
        if not sched.due_date:
            continue
        due = sched.due_date if sched.due_date.tzinfo else sched.due_date.replace(
            tzinfo=timezone.utc)
        days_overdue = (now - due).days
        if days_overdue > GRACE_DAYS and not sched.is_overdue:
            # 3-day grace passed, no delay requested — apply penalty
            sched.is_overdue = True
            TrustService.apply_delay_failure_penalty(db, loan.owner, loan)
            penalty_applied = True

    if penalty_applied:
        db.commit()
        return {"action": "Delay Failure Penalty Applied", "details": "+5% interest on balance, -10 trust score"}

    penalty_amount = loan_service.apply_late_penalty_logic(
        db, loan, loan.owner)
    if penalty_amount > 0:
        return {"action": "Penalty Applied", "amount": float(penalty_amount)}
    return {"message": "Loan is healthy or already processed today."}


# --- 5. DELAY REQUEST ─────────────────────────────────────────────────────────
# POST /api/v1/loans/{loan_id}/delay-request
#
# What it does:
#   - User requests a payment delay for one specific installment.
#   - While the request is "pending", the interest rate is frozen (stays at 15%,
#     does NOT jump to 20% as it would for a straight overdue).
#   - Admin reviews: approve → installment due date extended 30 days.
#                    decline → normal overdue penalty rate resumes.
#
# Accepts: multipart/form-data (reason + schedule_id + optional proof file)

@router.post("/{loan_id}/delay-request")
async def submit_delay_request(
    request: Request,
    loan_id: int,
    reason: str = Form(...),
    schedule_id: int = Form(...),
    proof: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    if loan.status != "disbursed":
        raise HTTPException(
            status_code=400, detail="Loan is not active for delay requests.")

    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.id == schedule_id,
        models.LoanSchedule.loan_id == loan_id
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Installment not found.")
    if schedule.status == "paid":
        raise HTTPException(
            status_code=400, detail="Installment already paid.")

    existing_status = getattr(schedule, 'delay_status', None)
    if existing_status in ("pending", "approved"):
        raise HTTPException(
            status_code=400,
            detail="A delay request is already active for this installment."
        )

    # Enforce the delay-request rules: blocked while still in the
    # Development/Pre-Production 3-month grace policy, and capped at
    # MAX_DELAY_ATTEMPTS lifetime attempts per loan (not per-installment —
    # a loan-wide counter so re-requesting on a different installment after
    # using attempts elsewhere is still correctly blocked).
    allowed, block_reason = engine.can_request_delay(loan)
    if not allowed:
        raise HTTPException(status_code=400, detail=block_reason)

    # Proof is REQUIRED for delay requests
    if not proof or not proof.filename:
        raise HTTPException(
            status_code=400, detail="Proof / supporting document is required for a delay request.")
    proof_url = None
    if proof and proof.filename:
        try:
            import uuid as _uuid
            from pathlib import Path
            folder = Path("uploads/delay_proofs")
            folder.mkdir(parents=True, exist_ok=True)
            ext = Path(proof.filename).suffix.lower() or ".jpg"
            fname = f"{_uuid.uuid4()}{ext}"
            content = await proof.read()
            with open(folder / fname, "wb") as f:
                f.write(content)
            proof_url = f"/uploads/delay_proofs/{fname}"
        except Exception:
            proof_url = None

    # Mark the installment — shields it from penalty escalation while pending
    schedule.delay_requested = True
    schedule.delay_reason = reason.strip()
    schedule.delay_status = "pending"
    if hasattr(schedule, 'delay_proof_url'):
        schedule.delay_proof_url = proof_url

    # Records the request timestamp (fixes "Request Date: —" in the admin
    # delay requests list) and applies the -5 trust penalty if this is being
    # submitted on the final day of the 3-day warning window.
    engine_result = engine.submit_delay_request(
        db, loan, schedule, current_user)

    db.commit()

    # Notify user and admin
    try:
        from backend.api.v1.admin import create_user_notification, create_admin_alert
        create_user_notification(
            db, current_user.id,
            "⏳ Delay Request Submitted",
            f"Your delay request for installment #{schedule.installment_number} of "
            f"'{loan.project_title}' is under review. "
            f"Interest will not escalate while pending admin decision."
        )
        create_admin_alert(
            db,
            "⏳ Payment Delay — Review Required",
            f"Producer '{current_user.name}' requested a delay for installment "
            f"#{schedule.installment_number} of '{loan.project_title}'. "
            f"Reason: {reason[:150]}"
        )
        db.commit()
    except Exception:
        pass

    # Audit log
    try:
        log_action(db, admin_id=current_user.id, action="REQUEST_DELAY",
                   ip=request.client.host if request.client else "127.0.0.1",
                   target_id=loan_id,
                   details={
                       "project": loan.project_title or "—",
                       "reason": (reason or "")[:150],
                       "installment": getattr(schedule, 'installment_number', '—'),
                       "user": current_user.name or current_user.email,
                       "production_phase": getattr(loan, 'current_stage', '—')
                   })
        db.commit()
    except Exception:
        pass

    msg = "Delay request submitted. Interest escalation is paused while admin reviews."
    if engine_result.get("last_day_penalty_applied"):
        msg += " Note: -5 trust points applied for submitting on the final day of the warning window."

    return {
        "message": msg,
        "schedule_id": schedule_id,
        "delay_status": "pending"
    }


# --- 6. MONTHLY UPDATE (grace period for pre-production) ────────────────────
# POST /api/v1/loans/{loan_id}/grace-update?update_text=...
#
# What it does:
#   - Only for loans in pre_production stage.
#   - Producer has 3 grace months — no payments required as long as they submit
#     a monthly production update each month.
#   - Admin reviews each update:
#       approve → grace month is counted, loan is protected.
#       decline OR producer misses the update → +3% interest (15% → 18%) and -5 trust points.
#   - After all 3 grace months are used, normal repayment schedule resumes.
#   - For large pre-production loans (≥ ₱1,000,000): funds disbursed in 3 tranches (3-give).

@router.post("/{loan_id}/grace-update")
async def submit_grace_update(
    request: Request,
    loan_id: int,
    update_text: str = Form(...),
    progress_photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    if loan.status not in ["disbursed", "approved"]:
        raise HTTPException(status_code=400, detail="Loan is not active.")

    # Monthly update is allowed for ANY disbursed loan (any stage).
    # Rules (per the installment due-date cycle, NOT the calendar month):
    #   - The "window" for a given installment runs from the previous due
    #     date up to and including the current due date (e.g. a loan that
    #     started June 17 has its first window June 17 -> July 17, not
    #     June 1 -> June 30).
    #   - Only 1 submission per window (pending OR approved blocks resubmit
    #     for that same window).
    #   - If the last submission for this window was REJECTED, the user can
    #     submit again within the same window.
    schedule = (
        db.query(models.LoanSchedule)
        .filter(
            models.LoanSchedule.loan_id == loan_id,
            models.LoanSchedule.status != "paid",
        )
        .order_by(models.LoanSchedule.installment_number.asc())
        .first()
    )
    if not schedule:
        raise HTTPException(
            status_code=400, detail="No upcoming installment found for this loan.")

    if schedule.monthly_update_status == "pending":
        raise HTTPException(
            status_code=400,
            detail="You already have a monthly update pending admin review for this period. "
                   "Only 1 attempt is allowed unless it is rejected."
        )
    if schedule.monthly_update_status == "approved":
        raise HTTPException(
            status_code=400,
            detail="This period's monthly update has already been approved."
        )

    stage = getattr(loan, 'current_stage', '') or ''
    grace_remaining = getattr(loan, 'grace_months_remaining', 0) or 0

    if not update_text or len(update_text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="Update must be at least 20 characters describing production progress."
        )

    # Handle optional progress photo upload
    photo_url = None
    if progress_photo and progress_photo.filename:
        try:
            import uuid as _uuidp
            from pathlib import Path as _Path
            folder = _Path("uploads/grace_photos")
            folder.mkdir(parents=True, exist_ok=True)
            ext = _Path(progress_photo.filename).suffix.lower() or ".jpg"
            fname = f"{_uuidp.uuid4()}{ext}"
            content_bytes = await progress_photo.read()
            with open(folder / fname, "wb") as _f:
                _f.write(content_bytes)
            photo_url = f"/uploads/grace_photos/{fname}"
        except Exception:
            photo_url = None

    import uuid as _uuid
    ref = f"GRACE-{_uuid.uuid4().hex[:8].upper()}"

    # Persist the actual GraceUpdate row — this was previously missing
    # entirely, which meant the admin's "Request Monthly Updates" review
    # queue (GET /admin/grace-updates) never had anything real to show even
    # though the producer was told "submitted successfully".
    grace_update = models.GraceUpdate(
        loan_id=loan_id,
        user_id=current_user.id,
        schedule_id=schedule.id,
        update_text=update_text.strip(),
        photo_url=photo_url,
        reference=ref,
        status="pending",
    )
    db.add(grace_update)
    db.flush()

    # Records the request timestamp against the installment and applies the
    # -2 "submitted on the last warning day" penalty if applicable.
    engine_result = engine.submit_monthly_update_request(
        db, loan, schedule, current_user)
    # (grace_update.schedule_id, set above at creation, is the only link
    # needed between the two tables — see note in models.py)

    db.commit()

    try:
        from backend.api.v1.admin import create_admin_alert, create_user_notification
        grace_info = f" Grace months remaining: {grace_remaining}." if grace_remaining > 0 else ""
        create_admin_alert(
            db,
            "📹 Monthly Production Update — Review Required",
            f"Producer '{current_user.name}' submitted a monthly update for "
            f"'{loan.project_title}' (Loan #{loan.id}).{grace_info} Ref: {ref}. "
            f"Update: {update_text[:200]}"
        )
        create_user_notification(
            db, current_user.id,
            "✅ Monthly Update Submitted",
            f"Your monthly production update for '{loan.project_title}' has been received "
            f"(Ref: {ref}). Admin will review shortly."
        )
        db.commit()
    except Exception:
        pass

    # Audit log
    try:
        _phase = getattr(loan, 'current_stage', '') or ''
        if not _phase and loan.project_description:
            import re as _re
            _pm = _re.search(
                r'Phase:\s*([^|]+)', loan.project_description or '', _re.IGNORECASE)
            if _pm:
                _phase = _pm.group(1).strip()
        log_action(db, admin_id=current_user.id, action="MONTHLY_UPDATE",
                   ip=request.client.host if hasattr(
                       request, 'client') and request.client else "127.0.0.1",
                   target_id=loan_id,
                   details={
                       "project": loan.project_title or "—",
                       "production_phase": _phase or "—",
                       "update": (update_text or "")[:150],
                       "user": current_user.name or current_user.email,
                       "reference": ref
                   })
        db.commit()
    except Exception:
        pass

    msg = "Monthly production update submitted successfully. Admin will review shortly."
    if engine_result.get("last_day_penalty_applied"):
        msg += " Note: -2 trust points applied for submitting on the final day of the warning window."

    return {
        "message": msg,
        "reference": ref,
        "grace_months_remaining": grace_remaining,
        "photo_url": photo_url,
        "status": "pending_admin_review"
    }


# --- 7. REPAY ─────────────────────────────────────────────────────────────────
# POST /api/v1/loans/{loan_id}/repay  (JSON body)
#
# What it does:
#   - User enters amount + PIN. That's it.
#   - No proof upload, no manual reference number.
#   - Payment method is auto-read from loan.disbursement_method (set at application time).
#   - System auto-generates a reference number.
#   - Demo mode: the actual money transfer happens externally (bank/GCash).
#     This endpoint records the intent and notifies admin to confirm.
#   - Admin confirms → full receipt generated and sent to user as in-app notification.

@router.post("/{loan_id}/repay")
def submit_repayment(
    loan_id: int,
    body: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    amount = body.get("amount")
    transaction_pin = body.get("transaction_pin") or body.get("pin")
    sender_name = body.get("sender_name", "").strip()
    sender_number = body.get("sender_number", "").strip()
    proof_url = body.get("proof_url", None)
    payment_method_label = body.get("payment_method_label", "") or body.get(
        "payment_method", "") or "On-file account"
    selected_method = body.get("payment_method", None)

    if not amount or float(amount) <= 0:
        raise HTTPException(status_code=400, detail="Enter a valid amount.")
    if not transaction_pin:
        raise HTTPException(
            status_code=400, detail="Transaction PIN required.")
    if current_user.account_status != "active":
        raise HTTPException(status_code=403, detail="Account restricted.")

    verify_transaction_auth(str(transaction_pin), current_user, db)

    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    if loan.status not in ["disbursed", "completed"]:
        raise HTTPException(
            status_code=400, detail="This loan is not active for repayment.")

    # Block re-submission while a previous receipt is still pending review
    existing_pending = db.query(models.RepaymentReceipt).filter(
        models.RepaymentReceipt.loan_id == loan_id,
        models.RepaymentReceipt.status == "pending"
    ).first()
    if existing_pending:
        raise HTTPException(
            status_code=400,
            detail=f"You already have a repayment (Ref: {existing_pending.reference_number}) "
            f"awaiting admin confirmation. Please wait for it to be approved or rejected "
            f"before submitting another."
        )

    # Use the user-selected payment method type for the receipt
    method = selected_method or getattr(
        loan, 'disbursement_method', None) or "On-file account"

    import uuid as _uuid
    auto_ref = f"REPAY-{_uuid.uuid4().hex[:10].upper()}"

    receipt = models.RepaymentReceipt(
        loan_id=loan_id,
        reference_number=auto_ref,
        amount=Decimal(str(amount)),
        method=method,
        proof_url=proof_url,
        status="pending"
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)

    # Audit log — PENDING_REPAYMENT so it shows in Repayment filter
    try:
        log_action(db, admin_id=current_user.id, action="PENDING_REPAYMENT",
                   ip=request.client.host, target_id=current_user.id,
                   details={"project": loan.project_title, "ref": auto_ref,
                            "sender": payment_method_label, "user": current_user.name})
    except Exception:
        pass

    # Notify user + admin
    try:
        from backend.api.v1.admin import create_user_notification, create_admin_alert
        create_user_notification(
            db, current_user.id,
            "💳 Repayment Submitted",
            f"Your repayment of ₱{float(amount):,.2f} for '{loan.project_title}' "
            f"has been recorded (Ref: {auto_ref}). "
            f"Payment via: {method}. Awaiting admin confirmation."
        )
        create_admin_alert(
            db,
            "💳 Repayment Pending Confirmation",
            f"Producer '{current_user.name}' submitted ₱{float(amount):,.2f} repayment "
            f"for '{loan.project_title}' via {method}. Ref: {auto_ref}. "
            f"Sender: {sender_name or '—'} / {sender_number or '—'}. Please confirm."
        )
        db.commit()
    except Exception:
        pass

    return {
        "message": "Repayment submitted. Admin will confirm and generate your receipt.",
        "receipt_id": receipt.id,
        "reference_number": auto_ref,
        "method": method,
        "status": "pending",
        "amount": float(amount)
    }


# --- 8. USER LOAN LIST ---

@router.get("/my-loans")
def get_my_loans(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loans = db.query(models.Loan).filter(
        models.Loan.owner_id == current_user.id
    ).order_by(models.Loan.id.desc()).all()

    result = []
    for loan in loans:
        pending_receipt = db.query(models.RepaymentReceipt).filter(
            models.RepaymentReceipt.loan_id == loan.id,
            models.RepaymentReceipt.status == "pending"
        ).first()
        result.append({
            "id": loan.id,
            "project_title": loan.project_title,
            "amount": float(loan.amount) if loan.amount else 0,
            "duration_months": loan.duration_months,
            "remaining_amount": float(loan.remaining_amount) if loan.remaining_amount else 0,
            "interest_rate": float(loan.interest_rate) if loan.interest_rate else 0,
            "monthly_payment": float(loan.monthly_payment) if loan.monthly_payment else 0,
            "status": loan.status or "pending",
            "admin_notes": loan.admin_notes,
            "next_payment_due": loan.next_payment_due.isoformat() if loan.next_payment_due else None,
            "is_overdue": loan.is_overdue or False,
            "total_penalty_paid": float(loan.total_penalty_paid) if loan.total_penalty_paid else 0,
            "missed_payments_count": loan.missed_payments_count or 0,
            "created_at": loan.created_at.isoformat() if loan.created_at else None,
            "owner_id": loan.owner_id,
            "script_url": loan.script_url,
            "lookbook_url": loan.lookbook_url,
            "trailer_url": loan.trailer_url,
            "project_description": loan.project_description,
            "requirements_list": loan.requirements_list or [],
            "disbursement_method": loan.disbursement_method or "pending",
            "disbursement_account": loan.disbursement_account or "TBD",
            "repayment_method": getattr(loan, 'repayment_method', ""),
            "current_stage": getattr(loan, 'current_stage', ""),
            "grace_months_remaining": getattr(loan, 'grace_months_remaining', 0) or 0,
            "is_on_production_break": getattr(loan, 'is_on_production_break', False) or False,
            "genre": _extract_genre(loan.project_description or ""),
            "description": loan.purpose or "",
            "production_phase": "",
            "budget_categories": "",
            "can_repay": loan.status == "disbursed" and (loan.remaining_amount or 0) > 0 and not pending_receipt,
            "has_pending_repayment": bool(pending_receipt),
            "pending_repayment_ref": pending_receipt.reference_number if pending_receipt else None,
        })
    return result


# --- NOTIFICATIONS ---

@router.get("/notifications")
def get_my_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    notifs = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()
    return [{
        "id": n.id,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    } for n in notifs]


@router.post("/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    n = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == current_user.id
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


# --- 9. ADMIN REVIEW ---

@router.patch("/review/{loan_id}")
def review_loan(
    loan_id: int,
    review: user_schemas.VerificationRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan project not found")

    loan.status = "approved" if review.approve else "rejected"
    loan.admin_notes = review.reason

    if review.approve:
        owner = loan.owner
        final_rate = 0.10 if owner.trust_score >= 80 else 0.15
        monthly = loan_service.calculate_monthly_payment(
            loan.amount, final_rate * 100, loan.duration_months)
        loan.interest_rate = final_rate
        loan.monthly_payment = float(monthly)
        loan.is_on_production_break = False
        loan_service.generate_loan_repayment_schedule(db, loan)

    db.commit()
    db.refresh(loan)
    return {"message": f"Loan {loan.status} successfully"}


# --- 10. REPAYMENT SCHEDULE ---

@router.get("/{loan_id}/schedule")
def get_my_loan_schedule(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.loan_id == loan_id
    ).order_by(models.LoanSchedule.installment_number).all()

    return [{
        "id": s.id,
        "installment_number": s.installment_number,
        "due_date": s.due_date.isoformat() if s.due_date else None,
        "amount_due": float(s.amount_due),
        "status": s.status,
        "delay_requested": getattr(s, 'delay_requested', False),
        "delay_status": getattr(s, 'delay_status', None),
        "delay_reason": getattr(s, 'delay_reason', None),
    } for s in schedule]


# --- LEGACY DELAY REPORT (kept for backward compat) ---

@router.post("/report-delay/{loan_id}")
def report_production_delay(
    loan_id: int,
    reason: str,
    proof_url: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    loan.is_on_production_break = True
    loan.admin_notes = f"DELAY REPORTED: {reason}. Proof: {proof_url}"
    db.commit()
    return {"message": "Delay reported. Your reputation is shielded while we review your proof."}


# --- HELPERS ---

def _extract_genre(project_description: str) -> str:
    import re
    m = re.search(r"Genre:\s*([^|]+)", project_description, re.IGNORECASE)
    return m.group(1).strip() if m else ""
