from sqlalchemy import func, or_
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query, Form, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from backend.core.database import get_db
from backend.core.security import get_current_user, get_current_admin
from backend.models import models
from backend.models.schemas import user_schemas
from backend.services.audit_service import log_action
from backend.services import transaction_service, loan_service
from backend.services import delay_engine as engine
from backend.services.trust_service import TrustService

router = APIRouter(prefix="/admin", tags=["Admin"])


def _extract_genre_from_desc(desc: str) -> str:
    """Extract genre string from 'Genre: X | Location: Y | Phase: Z | Budget: W' format."""
    import re
    m = re.search(r"Genre:\s*([^|]+)", desc, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _extract_phase_from_desc(desc: str) -> str:
    """Extract production phase from description metadata."""
    import re
    m = re.search(r"Phase:\s*([^|]+)", desc, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _extract_budget_from_desc(desc: str) -> str:
    """Extract budget categories from description metadata."""
    import re
    m = re.search(r"Budget:\s*(.+)", desc, re.IGNORECASE)
    return m.group(1).strip() if m else ""


# --- HELPER: INTERNAL NOTIFICATIONS ---


def create_user_notification(db: Session, user_id: int, title: str, message: str):
    """Adds an in-app notification for a user."""
    db.add(models.Notification(user_id=user_id,
           title=title, message=message, is_read=False))


def create_admin_alert(db: Session, title: str, message: str):
    """Sends an in-app notification to ALL admin accounts (security flags, repayment confirmations, etc.)"""
    admins = db.query(models.User).filter(models.User.is_admin == True).all()
    for admin in admins:
        db.add(models.Notification(
            user_id=admin.id,
            title=title,
            message=message,
            is_read=False
        ))

# --- 1. TREASURY  ---


@router.post("/treasury/deposit")
def add_admin_funds(
    amount: float,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    if amount <= 0:
        raise HTTPException(
            status_code=400, detail="Deposit amount must be greater than zero.")

    vault = db.query(models.Treasury).first()
    if not vault:
        vault = models.Treasury(total_injected=0, available_balance=0)
        db.add(vault)
        db.flush()

    from decimal import Decimal as _Dec
    vault.total_injected = (
        vault.total_injected or _Dec(0)) + _Dec(str(amount))
    vault.available_balance = (
        vault.available_balance or _Dec(0)) + _Dec(str(amount))

    log_action(
        db,
        admin_id=admin.id,
        action="ADMIN_CAPITAL_DEPOSIT",
        ip=request.client.host,
        target_id=vault.id,
        details=f"Injected {amount} PHP into the lending fund."
    )

    db.commit()
    return {
        "message": "Capital successfully injected.",
        "new_available_balance": float(vault.available_balance),
        "total_capital_injected": float(vault.total_injected)
    }


# --- 2. ADMIN DASHBOARD ---


@router.get("/stats/dashboard", response_model=user_schemas.PlatformStats)
def get_platform_stats(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    vault = db.query(models.Treasury).first()

    total_lent = db.query(func.sum(models.Loan.amount)).filter(
        models.Loan.status == "disbursed"
    ).scalar() or 0.0

    total_interest = db.query(
        func.sum(models.Loan.interest_rate * models.Loan.amount)
    ).filter(models.Loan.status == "disbursed").scalar() or 0.0

    expected_today = db.query(func.sum(models.LoanSchedule.amount_due)).filter(
        models.LoanSchedule.due_date >= today_start,
        models.LoanSchedule.due_date <= today_start + timedelta(days=1),
        models.LoanSchedule.status == "unpaid"
    ).scalar() or 0.0

    total_users = db.query(models.User).filter(
        models.User.is_admin == False,
        models.User.account_status.notin_(["archived", "frozen", "freeze"])
    ).count()
    gold_tier_users = db.query(models.User).filter(
        models.User.trust_tier == 2).count()

    pending_ids = db.query(models.User).filter(
        models.User.verification_status == "pending"
    ).count()

    pending_loans = db.query(models.Loan).filter(
        models.Loan.status == "pending"
    ).count()

    overdue_count = db.query(models.Loan).filter(
        models.Loan.is_overdue == True).count()
    total_loans = db.query(models.Loan).count()
    default_rate_val = (overdue_count / total_loans *
                        100) if total_loans > 0 else 0

    # Revenue = only confirmed repayment receipts
    total_repaid = db.query(func.sum(models.RepaymentReceipt.amount)).filter(
        models.RepaymentReceipt.status == "confirmed"
    ).scalar() or 0.0

    active_producers = total_users

    active_loans_count = db.query(models.Loan).filter(
        models.Loan.status == "disbursed"
    ).count()

    return {
        "total_capital_injected": float(vault.total_injected) if vault else 0.0,
        "available_treasury_balance": float(vault.available_balance) if vault else 0.0,
        "estimated_revenue": round(float(total_interest), 2),
        "total_capital_out": round(float(total_lent), 2),
        "expected_collections_today": round(float(expected_today), 2),
        "active_users": active_producers,
        "active_producers": active_producers,
        "active_loans": active_loans_count,
        "total_repaid": round(float(total_repaid), 2),
        "gold_tier_users": gold_tier_users,
        "pending_verifications": pending_ids,
        "pending_loan_requests": pending_loans,
        "default_rate": f"{round(default_rate_val, 2)}%",
        "currency": "PHP"
    }

# --- 3. PENDING VERIFICATIONS ---


@router.get("/pending-verifications")
def get_pending_verifications(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    # Notify admins of new pending verifications
    pending_count = db.query(models.User).filter(
        models.User.verification_status == "pending"
    ).count()

    # Only notify if new pendings appeared (avoid spam)
    if hasattr(admin, '_last_pending_count'):
        delta = pending_count - admin._last_pending_count
        if delta > 0:
            create_admin_alert(
                db,
                "🆕 New Profile Verification Pending",
                f"{delta} new user{'s' if delta > 1 else ''} need verification."
            )
    setattr(admin, '_last_pending_count', pending_count)

    users = db.query(models.User).filter(
        models.User.verification_status == "pending").all()

    # Only include users who have genuinely new/changed data waiting for review.
    # A user with empty pending_changes should NOT appear in admin — it means
    # their data was already approved and they haven't edited anything new.
    users = [u for u in users if u.pending_changes and len(
        u.pending_changes) > 0]

    def safe_email(v):
        """Heal broken double-domain addresses before returning to frontend."""
        if v and isinstance(v, str) and v.count("@") > 1:
            return v[:v.rfind("@")]
        return v

    result = []
    for u in users:
        result.append({
            "id": u.id,
            "name": u.name,
            "email": safe_email(u.email),
            "is_verified": u.is_verified,
            "is_admin": u.is_admin,
            "trust_score": u.trust_score or 0,
            "trust_tier": u.trust_tier or 0,
            "account_status": u.account_status or "active",
            "verification_status": u.verification_status or "unverified",
            "recovery_email": safe_email(getattr(u, "recovery_email", None)),
            "pin_recovery_email": safe_email(getattr(u, "pin_recovery_email", None)),
            "id_type": getattr(u, "id_type", None),
            "id_expiry_date": str(getattr(u, "id_expiry_date", None)) if getattr(u, "id_expiry_date", None) else None,
            "id_photo_url": getattr(u, "id_photo_url", None),
            "selfie_photo_url": getattr(u, "selfie_photo_url", None),
            "filmmaker_role": getattr(u, "filmmaker_role", None),
            "bio": getattr(u, "bio", None),
            "portfolio_url": getattr(u, "portfolio_url", None),
            "past_project_url": getattr(u, "past_project_url", None),
            "emergency_contact_name": getattr(u, "emergency_contact_name", None),
            "emergency_contact_relationship": getattr(u, "emergency_contact_relationship", None),
            "emergency_contact_phone": getattr(u, "emergency_contact_phone", None),
            "emergency_contact_email": getattr(u, "emergency_contact_email", None),
            "last_login_ip": getattr(u, "last_login_ip", None),
            "registration_ip": getattr(u, "registration_ip", None),
            "failed_pin_attempts": getattr(u, "failed_pin_attempts", 0) or 0,
            "last_login_at": u.last_login_at.isoformat() if getattr(u, "last_login_at", None) else None,
            "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
            "loans": [],
            "cards": [],
            # Only the fields that changed since last approval
            "pending_changes": getattr(u, "pending_changes", None) or {},
            "approved_sections": getattr(u, "approved_sections", None) or {},
            "emergency_contact_id_url": getattr(u, "emergency_contact_id_url", None),
        })
    return result

# --- 4. VERIFY USER ---


@router.post("/verify-user/{user_id}")
def verify_user(
    request: Request,
    user_id: int,
    verification_data: user_schemas.VerificationRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    target_user = db.query(models.User).filter(
        models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_status = target_user.verification_status

    old_pts = target_user.trust_score or 0
    pending = target_user.pending_changes or {}

    if verification_data.approve:
        kyc_fields = {"id_photo_url", "selfie_photo_url",
                      "id_type", "id_expiry_date"}
        approved_has_kyc = bool(kyc_fields & set(pending.keys()))

        has_both_kyc_photos = bool(
            target_user.id_photo_url and target_user.selfie_photo_url)
        if approved_has_kyc and has_both_kyc_photos:
            target_user.is_verified = True
            target_user.verification_status = "verified"
        else:
            target_user.verification_status = "approved"

        # Track which sections were approved — always build a NEW dict
        approved = dict(target_user.approved_sections or {})
        prof_fields = {"filmmaker_role", "bio", "portfolio_url"}
        if prof_fields & set(pending.keys()):
            approved["professional"] = True
        if "past_project_url" in pending or "past_project_urls" in pending:
            approved["past_project"] = True
        ec_name_fields = {"emergency_contact_name",
                          "emergency_contact_relationship"}
        if ec_name_fields & set(pending.keys()):
            approved["ec_name"] = True
        ec_contact_fields = {
            "emergency_contact_phone", "emergency_contact_email"}
        if ec_contact_fields & set(pending.keys()):
            approved["ec_contact"] = True
        if "emergency_contact_id_url" in pending:
            approved["ec_id"] = True
        if approved_has_kyc:
            approved["kyc"] = True
        # Assign brand new dict to force SQLAlchemy dirty tracking
        target_user.approved_sections = dict(approved)
        # Clear pending — admin approved this batch
        target_user.pending_changes = {}
        # Only remove from rejected_sections the sections that were just approved
        # Leave other rejected sections intact so they still show as rejected to the user
        existing_rejected = dict(target_user.rejected_sections or {})
        if prof_fields & set(pending.keys()):
            existing_rejected.pop("professional", None)
        if "past_project_url" in pending:
            existing_rejected.pop("past_project", None)
        if ec_name_fields & set(pending.keys()):
            existing_rejected.pop("ec_name", None)
        if ec_contact_fields & set(pending.keys()):
            existing_rejected.pop("ec_contact", None)
        if "emergency_contact_id_url" in pending:
            existing_rejected.pop("ec_id", None)
        if approved_has_kyc:
            existing_rejected.pop("kyc", None)
        target_user.rejected_sections = dict(existing_rejected)

        TrustService.apply_profile_update_boost(db, target_user)
        pts_gained = (target_user.trust_score or 0) - old_pts

        # Build specific section names for notification
        approved_names = []
        if prof_fields & set(pending.keys()):
            approved_names.append("Professional Info")
        if "past_project_url" in pending:
            approved_names.append("Past Project")
        if ec_name_fields & set(pending.keys()):
            approved_names.append("Emergency Contact (Name/Relation)")
        if ec_contact_fields & set(pending.keys()):
            approved_names.append("Emergency Contact (Phone/Email)")
        if "emergency_contact_id_url" in pending:
            approved_names.append("Emergency Contact ID")
        if approved_has_kyc:
            approved_names.append("Identity Verification (KYC)")

        sections_str = ", ".join(
            approved_names) if approved_names else "your profile"
        msg = f"✅ Approved: {sections_str}."
        if pts_gained > 0:
            msg += f" +{pts_gained} Trust Points unlocked. 🎉"
        if target_user.is_verified:
            msg += " Identity verified — you can now apply for film loans."
        else:
            msg += " Complete Identity Verification (KYC) to unlock loan applications."
        create_user_notification(db, user_id, "✅ Profile Approved!", msg)

        log_action(
            db,
            admin_id=admin.id,
            action="USER_VERIFICATION_APPROVED",
            ip=request.client.host,
            target_id=user_id,
            details={
                "approved_sections": approved_names,
                "pts_gained": pts_gained,
                "user": target_user.name
            }
        )
    else:
        # Rejection: preserve ALL previously approved sections.
        # We only clear pending_changes and set status to rejected.
        # Previously approved sections remain in approved_sections — their trust
        # points are preserved. Only the NEW (pending) batch is rejected.
        pending = dict(target_user.pending_changes or {})
        approved_secs = dict(target_user.approved_sections or {})

        # Only revoke KYC verification if KYC fields were in the rejected batch
        kyc_fields = {"id_photo_url", "selfie_photo_url",
                      "id_type", "id_expiry_date"}
        rejecting_kyc = bool(kyc_fields & set(pending.keys()))
        if rejecting_kyc:
            target_user.is_verified = False
            if approved_secs.get("kyc"):
                del approved_secs["kyc"]
        # Only set verification_status to rejected if not already KYC verified
        if not target_user.is_verified:
            target_user.verification_status = "rejected"
        else:
            # User has valid KYC - keep verified status, just mark section as needing resubmit
            target_user.verification_status = "verified"

        # Track WHICH sections were rejected so the frontend can show per-section state
        # even after user resubmits only some sections (changing global vStatus to 'pending')
        prof_fields_r = {"filmmaker_role", "bio", "portfolio_url"}
        ec_name_fields_r = {"emergency_contact_name",
                            "emergency_contact_relationship"}
        ec_contact_fields_r = {
            "emergency_contact_phone", "emergency_contact_email"}
        rejected_secs = {}
        if prof_fields_r & set(pending.keys()):
            rejected_secs["professional"] = True
        if "past_project_url" in pending or "past_project_urls" in pending:
            rejected_secs["past_project"] = True
        if ec_name_fields_r & set(pending.keys()):
            rejected_secs["ec_name"] = True
        if ec_contact_fields_r & set(pending.keys()):
            rejected_secs["ec_contact"] = True
        if "emergency_contact_id_url" in pending:
            rejected_secs["ec_id"] = True
        if rejecting_kyc:
            rejected_secs["kyc"] = True

        target_user.approved_sections = dict(approved_secs)
        target_user.pending_changes = {}
        target_user.rejected_sections = dict(rejected_secs)
        TrustService.apply_profile_update_boost(db, target_user)

        # Build specific section names for rejection notification
        rejected_names = []
        prof_fields_r = {"filmmaker_role", "bio", "portfolio_url"}
        ec_name_fields_r = {"emergency_contact_name",
                            "emergency_contact_relationship"}
        ec_contact_fields_r = {
            "emergency_contact_phone", "emergency_contact_email"}
        kyc_fields_r = {"id_photo_url", "selfie_photo_url",
                        "id_type", "id_expiry_date"}
        if prof_fields_r & set(pending.keys()):
            rejected_names.append("Professional Info")
        if "past_project_url" in pending or "past_project_urls" in pending:
            rejected_names.append("Past Project")
        if ec_name_fields_r & set(pending.keys()):
            rejected_names.append("Emergency Contact (Name/Relation)")
        if ec_contact_fields_r & set(pending.keys()):
            rejected_names.append("Emergency Contact (Phone/Email)")
        if "emergency_contact_id_url" in pending:
            rejected_names.append("Emergency Contact ID")
        if kyc_fields_r & set(pending.keys()):
            rejected_names.append("Identity Verification (KYC)")

        sections_str = ", ".join(
            rejected_names) if rejected_names else "your submission"
        rej_msg = (
            f"❌ Rejected: {sections_str}. "
            f"Reason: {verification_data.reason}. "
            f"Please fix and resubmit."
        )
        create_user_notification(db, user_id, "❌ Submission Rejected", rej_msg)

        log_action(
            db,
            admin_id=admin.id,
            action="USER_VERIFICATION_REJECTED",
            ip=request.client.host,
            target_id=user_id,
            details={
                "rejected_sections": rejected_names,
                "reason": verification_data.reason,
                "user": target_user.name
            }
        )

    db.commit()
    return {"message": f"User {target_user.name} set to {target_user.verification_status}."}


@router.post("/verify-user/{user_id}/section")
def verify_user_section(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
    section: str = Form(...),          # e.g. "professional", "kyc", "ec_id"
    approve: bool = Form(...),
    reason: str = Form(default="")
):
    """
    Per-section approve / reject for a user's pending profile changes.

    This fixes the core bug reported as issues #1 and #5: the original
    endpoint approves/rejects the ENTIRE pending_changes batch at once —
    so rejecting "Professional Info" would also revoke a previously-valid
    KYC approval if both happened to land in the same batch. This endpoint
    lets the admin act on ONE section at a time so KYC and professional info
    are always evaluated independently.

    ``section`` must be one of:
        professional | past_project | ec_name | ec_contact | ec_id | kyc
    """
    SECTION_FIELD_MAP = {
        "professional": {"filmmaker_role", "bio", "portfolio_url"},
        "past_project": {"past_project_url", "past_project_urls"},
        "ec_name": {"emergency_contact_name", "emergency_contact_relationship"},
        "ec_contact": {"emergency_contact_phone", "emergency_contact_email"},
        "ec_id": {"emergency_contact_id_url"},
        "kyc": {"id_photo_url", "selfie_photo_url", "id_type", "id_expiry_date"},
    }
    SECTION_LABEL = {
        "professional": "Professional Info",
        "past_project": "Past Project",
        "ec_name": "Emergency Contact (Name/Relation)",
        "ec_contact": "Emergency Contact (Phone/Email)",
        "ec_id": "Emergency Contact ID",
        "kyc": "Identity Verification (KYC)",
    }

    if section not in SECTION_FIELD_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown section '{section}'. Must be one of: {', '.join(SECTION_FIELD_MAP)}"
        )

    target_user = db.query(models.User).filter(
        models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    pending = dict(target_user.pending_changes or {})
    section_fields = SECTION_FIELD_MAP[section]

    # Only the fields of this specific section that are actually pending
    pending_section_keys = section_fields & set(pending.keys())
    if not pending_section_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Section '{section}' has no pending changes to act on."
        )

    # Extract just those keys into a mini-pending dict for processing
    section_pending = {k: pending[k] for k in pending_section_keys}

    approved_secs = dict(target_user.approved_sections or {})
    rejected_secs = dict(target_user.rejected_sections or {})
    old_pts = target_user.trust_score or 0

    if approve:
        # Apply the section's field values to the user record
        for field, value in section_pending.items():
            if hasattr(target_user, field):
                setattr(target_user, field, value)

        approved_secs[section] = True
        rejected_secs.pop(section, None)
        target_user.approved_sections = dict(approved_secs)
        target_user.rejected_sections = dict(rejected_secs)

        # KYC: only set is_verified if both photos are present
        if section == "kyc":
            has_both = bool(
                target_user.id_photo_url and target_user.selfie_photo_url)
            if has_both:
                target_user.is_verified = True
                target_user.verification_status = "verified"
            else:
                target_user.verification_status = "approved"

        # Remove just this section's fields from pending_changes
        remaining_pending = {k: v for k, v in pending.items()
                             if k not in section_fields}
        target_user.pending_changes = remaining_pending

        # If pending_changes is now empty and user is KYC-verified, ensure
        # verification_status reflects that properly
        if not remaining_pending and target_user.is_verified:
            target_user.verification_status = "verified"
        elif not remaining_pending and not target_user.is_verified:
            # All pending approved but no KYC yet
            target_user.verification_status = "approved"

        TrustService.apply_profile_update_boost(db, target_user)
        pts_gained = (target_user.trust_score or 0) - old_pts

        msg = f"✅ Approved: {SECTION_LABEL[section]}."
        if pts_gained > 0:
            msg += f" +{pts_gained} Trust Points unlocked. 🎉"
        if section == "kyc" and target_user.is_verified:
            msg += " Identity verified — you can now apply for film loans."
        create_user_notification(
            db, user_id, "✅ Profile Section Approved!", msg)

        log_action(
            db, admin_id=admin.id,
            action="USER_VERIFICATION_APPROVED",
            ip=request.client.host,
            target_id=user_id,
            details={
                "approved_sections": [SECTION_LABEL[section]],
                "pts_gained": pts_gained,
                "user": target_user.name
            }
        )
    else:
        # Reject this section only — do NOT touch other sections
        rejected_secs[section] = True

        # Only revoke is_verified if KYC was specifically rejected
        if section == "kyc":
            target_user.is_verified = False
            approved_secs.pop("kyc", None)

        target_user.approved_sections = dict(approved_secs)
        target_user.rejected_sections = dict(rejected_secs)

        # Remove just this section's fields from pending_changes
        remaining_pending = {k: v for k, v in pending.items()
                             if k not in section_fields}
        target_user.pending_changes = remaining_pending

        # Re-evaluate verification_status — keep "pending" if there are still
        # other pending sections so the user card stays in the admin review list.
        # Only set "rejected" (or "verified") once ALL pending sections are resolved.
        if remaining_pending:
            # Still has other sections pending — stay visible in review list
            target_user.verification_status = "pending"
        elif not target_user.is_verified:
            target_user.verification_status = "rejected"
        else:
            # KYC still valid and nothing more pending — mark verified
            target_user.verification_status = "verified"

        rej_msg = (
            f"❌ Rejected: {SECTION_LABEL[section]}. "
            f"Reason: {reason}. Please fix and resubmit."
        )
        create_user_notification(
            db, user_id, "❌ Section Rejected", rej_msg)

        log_action(
            db, admin_id=admin.id,
            action="USER_VERIFICATION_REJECTED",
            ip=request.client.host,
            target_id=user_id,
            details={
                "rejected_sections": [SECTION_LABEL[section]],
                "reason": reason,
                "user": target_user.name
            }
        )

    db.commit()
    return {
        "message": f"Section '{section}' {'approved' if approve else 'rejected'} for {target_user.name}.",
        "is_verified": target_user.is_verified,
        "verification_status": target_user.verification_status,
        "approved_sections": target_user.approved_sections,
        "rejected_sections": target_user.rejected_sections,
        "pending_changes_remaining": list((target_user.pending_changes or {}).keys()),
    }


@router.get("/loans/all")
def get_all_loans(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    loans = db.query(models.Loan).order_by(models.Loan.id.desc()).all()
    result = []
    for loan in loans:
        owner = db.query(models.User).filter(
            models.User.id == loan.owner_id).first()
        loan_dict = {
            "id": loan.id,
            "project_title": loan.project_title,
            "amount": float(loan.amount),
            "status": loan.status,
            # DB field is duration_months
            "term_months": getattr(loan, "duration_months", None),
            # stored as 0.15 → display as 15%
            "interest_rate": round(float(loan.interest_rate) * 100, 2) if loan.interest_rate else None,
            "purpose": getattr(loan, 'purpose', None),
            "project_description": getattr(loan, 'project_description', None),
            "genre": _extract_genre_from_desc(loan.project_description or ""),
            "production_phase": _extract_phase_from_desc(loan.project_description or ""),
            "budget_categories": (
                _extract_budget_from_desc(loan.project_description or "")
                or (", ".join(loan.requirements_list) if loan.requirements_list else "")
            ),
            "requirements_list": loan.requirements_list or [],
            "admin_notes": loan.admin_notes,
            "created_at": loan.created_at.isoformat() if loan.created_at else None,
            # Asset URLs — viewable/watchable in admin
            "script_url": getattr(loan, 'script_url', None),
            "lookbook_url": getattr(loan, 'lookbook_url', None),
            "trailer_url": getattr(loan, 'trailer_url', None),
            # Disbursement account — shown to admin on approval
            "disbursement_method": getattr(loan, 'disbursement_method', None),
            "disbursement_account": getattr(loan, 'disbursement_account', None),
            "remaining_amount": float(getattr(loan, 'remaining_amount', loan.amount) or loan.amount),
            "disbursed_at": loan.disbursed_at.isoformat() if getattr(loan, 'disbursed_at', None) else None,
            "owner": {"id": owner.id, "name": owner.name, "email": owner.email} if owner else None,
        }
        result.append(loan_dict)
    return result


# --- 5b. GET PENDING LOANS ---

@router.get("/loans/pending")
def get_pending_loans(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    loans = db.query(models.Loan).filter(
        models.Loan.status == "pending"
    ).order_by(models.Loan.id.desc()).all()
    result = []
    for loan in loans:
        owner = db.query(models.User).filter(
            models.User.id == loan.owner_id).first()
        result.append({
            "id": loan.id,
            "project_title": loan.project_title,
            "amount": float(loan.amount),
            "status": loan.status,
            # DB field is duration_months
            "term_months": getattr(loan, "duration_months", None),
            # stored as 0.15 → display as 15%
            "interest_rate": round(float(loan.interest_rate) * 100, 2) if loan.interest_rate else None,
            "purpose": getattr(loan, 'purpose', None),
            "project_description": getattr(loan, 'project_description', None),
            "genre": _extract_genre_from_desc(loan.project_description or ""),
            "production_phase": _extract_phase_from_desc(loan.project_description or ""),
            "budget_categories": (
                _extract_budget_from_desc(loan.project_description or "")
                or (", ".join(loan.requirements_list) if loan.requirements_list else "")
            ),
            "requirements_list": loan.requirements_list or [],
            "admin_notes": loan.admin_notes,
            "created_at": loan.created_at.isoformat() if loan.created_at else None,
            # Asset URLs — viewable/watchable in admin
            "script_url": getattr(loan, 'script_url', None),
            "lookbook_url": getattr(loan, 'lookbook_url', None),
            "trailer_url": getattr(loan, 'trailer_url', None),
            "disbursement_method": getattr(loan, 'disbursement_method', None),
            "disbursement_account": getattr(loan, 'disbursement_account', None),
            "owner": {"id": owner.id, "name": owner.name, "email": owner.email} if owner else None,
        })
    return result


# --- 5c. GET SINGLE LOAN (admin) ---

@router.get("/loans/{loan_id}")
def admin_get_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    owner = db.query(models.User).filter(
        models.User.id == loan.owner_id).first()
    return {
        "id": loan.id,
        "project_title": loan.project_title,
        "amount": float(loan.amount),
        "status": loan.status,
        # DB field is duration_months
        "term_months": getattr(loan, "duration_months", None),
        # stored as 0.15 → display as 15%
        "interest_rate": round(float(loan.interest_rate) * 100, 2) if loan.interest_rate else None,
        "purpose": getattr(loan, 'purpose', None),
        "project_description": getattr(loan, 'project_description', None),
        "genre": _extract_genre_from_desc(loan.project_description or ""),
        "production_phase": _extract_phase_from_desc(loan.project_description or ""),
        "budget_categories": (
            _extract_budget_from_desc(loan.project_description or "")
            or (", ".join(loan.requirements_list) if loan.requirements_list else "")
        ),
        "requirements_list": loan.requirements_list or [],
        "admin_notes": loan.admin_notes,
        "created_at": loan.created_at.isoformat() if loan.created_at else None,
        # Asset URLs — viewable/watchable in admin
        "script_url": getattr(loan, 'script_url', None),
        "lookbook_url": getattr(loan, 'lookbook_url', None),
        "trailer_url": getattr(loan, 'trailer_url', None),
        "disbursement_method": getattr(loan, 'disbursement_method', None),
        "disbursement_account": getattr(loan, 'disbursement_account', None),
        "owner": {"id": owner.id, "name": owner.name, "email": owner.email} if owner else None,
    }


@router.post("/loans/{loan_id}/remove", status_code=status.HTTP_200_OK)
def remove_loan_to_trash(
    request: Request,
    loan_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Moves a rejected loan to 'removed' status (stored in Settings trash)."""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    if loan.status not in ("rejected", "removed"):
        raise HTTPException(
            status_code=400, detail="Only rejected loans can be removed.")
    loan.status = "removed"
    owner_name = loan.owner.name if loan.owner else "—"
    project_title = loan.project_title or ""
    log_action(db, admin_id=admin.id, action="LOAN_REMOVED",
               target_id=loan.owner_id or loan_id, ip=request.client.host,
               details={
                   "user": owner_name,
                   "Project": project_title,
                   "Section": "Loan",
                   "Reason": "Moved to removed status"
               })
    db.commit()
    return {"message": f"Loan #{loan_id} moved to trash."}


@router.delete("/loans/{loan_id}/purge", status_code=status.HTTP_200_OK)
def purge_loan_permanently(
    request: Request,
    loan_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """
    Permanently deletes a loan and all associated data from the database.
    Only loans with status 'removed' can be purged. This cannot be undone.

    Deletion order (to satisfy FK constraints):
      1. GraceUpdate rows referencing this loan
      2. RepaymentReceipt rows referencing this loan
      3. DisbursementReceipt rows referencing this loan
      4. Transaction rows referencing this loan
      5. LoanSchedule rows referencing this loan
      6. The Loan row itself
    """
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    if loan.status != "removed":
        raise HTTPException(
            status_code=400,
            detail="Only loans with status 'removed' can be permanently deleted. "
                   "Move the loan to trash first via POST /loans/{id}/remove."
        )

    owner_name = loan.owner.name if loan.owner else "—"
    project_title = loan.project_title or ""

    # Delete dependents in FK-safe order
    db.query(models.GraceUpdate).filter(
        models.GraceUpdate.loan_id == loan_id).delete(synchronize_session=False)
    try:
        db.query(models.RepaymentReceipt).filter(
            models.RepaymentReceipt.loan_id == loan_id).delete(synchronize_session=False)
    except Exception:
        pass  # Table/model may not exist in all environments
    try:
        db.query(models.DisbursementReceipt).filter(
            models.DisbursementReceipt.loan_id == loan_id).delete(synchronize_session=False)
    except Exception:
        pass
    db.query(models.Transaction).filter(
        models.Transaction.loan_id == loan_id).delete(synchronize_session=False)
    db.query(models.LoanSchedule).filter(
        models.LoanSchedule.loan_id == loan_id).delete(synchronize_session=False)
    db.delete(loan)

    log_action(db, admin_id=admin.id, action="LOAN_PURGED",
               target_id=loan_id, ip=request.client.host,
               details={
                   "user": owner_name,
                   "project": project_title,
                   "note": "Permanently deleted from database"
               })
    db.commit()
    return {"message": f"Loan #{loan_id} ('{project_title}') permanently deleted."}


@router.post("/loans/{loan_id}/approve")
def approve_loan(
    request: Request,
    loan_id: int,
    admin_pin: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id
    ).with_for_update().first()

    if not loan or loan.status != "pending":
        raise HTTPException(
            status_code=400, detail="Loan not eligible for approval or already processed.")

    # Admin must verify their own PIN before disbursing funds
    from backend.core.security import verify_transaction_auth
    verify_transaction_auth(admin_pin, admin, db)

    # Demo mode: ensure a treasury row exists (create if missing), no balance check needed
    vault = db.query(models.Treasury).with_for_update().first()
    if not vault:
        from decimal import Decimal as _Dec
        vault = models.Treasury(total_injected=_Dec(
            "9999999"), available_balance=_Dec("9999999"))
        db.add(vault)
        db.flush()

    try:
        # Demo: deduct from vault for display purposes (won't block if insufficient)
        from decimal import Decimal as _Dec
        vault.available_balance = (
            vault.available_balance or _Dec("0")) - _Dec(str(loan.amount))

        # FIX: Set status to "approved" BEFORE process_disbursement,
        # which requires loan.status == "approved" to proceed.
        loan.status = "approved"
        db.flush()

        loan_service.generate_loan_repayment_schedule(db, loan)
        disbursement = transaction_service.process_disbursement(db, loan_id)

        if not disbursement:
            raise HTTPException(
                status_code=400, detail="Disbursement failed or already completed.")

        _phase = "Unknown"
        if loan.project_description:
            for _part in loan.project_description.split("|"):
                if "Phase:" in _part:
                    _phase = _part.replace("Phase:", "").strip()
                    break
        _dur = getattr(loan, "duration_months", 0) or 0
        _ty = _dur // 12
        _tm = _dur % 12
        _term_str = (f"{_ty}y " if _ty else "") + \
            (f"{_tm}m" if _tm else f"{_dur}m")
        log_action(
            db,
            admin_id=admin.id,
            action="LOAN_APPROVAL_DISBURSEMENT",
            target_id=loan_id,
            ip=request.client.host,
            details={
                "title": loan.project_title or "—",
                "production_phase": _phase,
                "term": _term_str.strip(),
                "user": loan.owner.name if loan.owner else "—"
            }
        )

        # Create disbursement receipt for transparency
        import uuid as _uuid
        receipt_ref = f"DISB-{_uuid.uuid4().hex[:10].upper()}"
        disb_receipt = models.DisbursementReceipt(
            loan_id=loan_id,
            reference_number=receipt_ref,
            amount=loan.amount,
            method=getattr(loan, 'disbursement_method', None) or "Pending",
            account_name=getattr(loan, 'disbursement_account', None) or "—",
            account_number=getattr(loan, 'disbursement_account', None) or "—",
            admin_note=f"Approved by Admin ID {admin.id}"
        )
        db.add(disb_receipt)

        create_user_notification(
            db,
            loan.owner_id,
            "Loan Approved & Disbursed! 🎥",
            f"₱{float(loan.amount):,.2f} for '{loan.project_title}' has been disbursed. "
            f"Reference No: {receipt_ref}. Check your registered payment account!"
        )

        # Admin transparency: notify all admins of disbursement
        create_admin_alert(
            db,
            "💰 Disbursement Issued",
            f"₱{float(loan.amount):,.2f} disbursed for '{loan.project_title}' (Loan #{loan_id}). "
            f"Ref: {receipt_ref}. To: {loan.disbursement_account or '—'}"
        )

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Fortress Block: Transaction rolled back. {str(e)}")

    return {"message": "Loan approved and vault balance updated.", "reference": receipt_ref if 'receipt_ref' in dir() else None}

# --- 6. REJECTION ---


@router.post("/loans/{loan_id}/reject")
def reject_loan(
    request: Request,
    loan_id: int,
    reason: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found.")

    loan.status = "rejected"  # admin must manually remove from Settings
    loan.admin_notes = reason
    owner_name = loan.owner.name if loan.owner else "—"
    log_action(db, admin_id=admin.id, action="LOAN_REJECTION",
               target_id=loan_id, ip=request.client.host,
               details={"user": owner_name, "project": loan.project_title or "", "reason": reason})

    create_user_notification(
        db,
        loan.owner_id,
        "Loan Application Update",
        f"Your application for '{loan.project_title}' was declined. Reason: {reason}"
    )

    db.commit()
    return {"message": "Loan application rejected."}


# --- 7. SEARCH ---


@router.get("/users/search")
def search_users(
    request: Request,
    q: Optional[str] = Query(None, min_length=1),
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    query = db.query(models.User).filter(models.User.is_admin == False)

    if q:
        q = q.strip()
        search_filter = or_(
            models.User.name.ilike(f"%{q}%"),
            models.User.email.ilike(f"%{q}%")
        )

        if q.isdigit():
            search_filter = or_(search_filter, models.User.id == int(q))

        query = query.filter(search_filter)

    users = query.offset(offset).limit(limit).all()
    # Heal broken double-domain emails before serialization
    for u in users:
        for field in ("recovery_email", "pin_recovery_email"):
            val = getattr(u, field, None)
            if val and isinstance(val, str) and val.count("@") > 1:
                setattr(u, field, val[:val.rfind("@")])
    return users

# --- 8. GET INDIVIDUAL USER (SENSITIVE) ---


@router.get("/users/{user_id}")
def admin_get_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    u = db.query(models.User).filter(models.User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    def safe_email(v):
        if v and isinstance(v, str) and v.count("@") > 1:
            return v[:v.rfind("@")]
        return v

    return {
        "id": u.id,
        "name": u.name,
        "email": safe_email(u.email),
        "is_verified": u.is_verified,
        "is_admin": u.is_admin,
        "trust_score": u.trust_score or 0,
        "trust_tier": u.trust_tier or 0,
        "account_status": u.account_status or "active",
        "verification_status": u.verification_status or "unverified",
        "recovery_email": safe_email(getattr(u, "recovery_email", None)),
        "pin_recovery_email": safe_email(getattr(u, "pin_recovery_email", None)),
        "id_type": getattr(u, "id_type", None),
        "id_expiry_date": str(getattr(u, "id_expiry_date", None)) if getattr(u, "id_expiry_date", None) else None,
        "id_photo_url": getattr(u, "id_photo_url", None),
        "selfie_photo_url": getattr(u, "selfie_photo_url", None),
        "filmmaker_role": getattr(u, "filmmaker_role", None),
        "bio": getattr(u, "bio", None),
        "portfolio_url": getattr(u, "portfolio_url", None),
        "past_project_url": getattr(u, "past_project_url", None),
        "emergency_contact_name": getattr(u, "emergency_contact_name", None),
        "emergency_contact_relationship": getattr(u, "emergency_contact_relationship", None),
        "emergency_contact_phone": getattr(u, "emergency_contact_phone", None),
        "emergency_contact_email": getattr(u, "emergency_contact_email", None),
        "last_login_ip": getattr(u, "last_login_ip", None),
        "registration_ip": getattr(u, "registration_ip", None),
        "failed_pin_attempts": getattr(u, "failed_pin_attempts", 0) or 0,
        "last_login_at": u.last_login_at.isoformat() if getattr(u, "last_login_at", None) else None,
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
        "approved_sections": getattr(u, "approved_sections", None) or {},
        "rejected_sections": getattr(u, "rejected_sections", None) or {},
        "loans": [],
        "cards": [],
    }


# --- 9. SECURITY & SESSIONS ---


# ── Admin: Remove a specific profile section from a user ──────────────────────
# This clears the section's data fields, removes it from approved_sections,
# and recalculates trust points. Used when admin needs to revoke data that was
# accidentally approved (expired ID, inappropriate bio, etc.)
SECTION_FIELDS_MAP = {
    "professional": ["filmmaker_role", "bio", "portfolio_url"],
    "past_project": ["past_project_url"],
    "ec_name": ["emergency_contact_name", "emergency_contact_relationship"],
    "ec_contact": ["emergency_contact_phone", "emergency_contact_email"],
    "ec_id": ["emergency_contact_id_url"],
    "kyc": ["id_photo_url", "selfie_photo_url", "id_type", "id_expiry_date"],
}

SECTION_LABELS = {
    "professional": "Professional Info",
    "past_project": "Past Project",
    "ec_name": "Emergency Contact (Name/Relation)",
    "ec_contact": "Emergency Contact (Phone/Email)",
    "ec_id": "Emergency Contact ID",
    "kyc": "Identity Verification (KYC)",
}


@router.delete("/users/{user_id}/remove-section/{section}", status_code=status.HTTP_200_OK)
def admin_remove_user_section(
    request: Request,
    user_id: int,
    section: str,
    reason: str = Query(default=""),
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """
    Admin removes a specific profile section from a user.
    - Clears the actual data fields on the user record
    - Removes the section from approved_sections
    - Also clears from pending_changes and rejected_sections
    - Recalculates trust score (points will be deducted)
    - Sends notification to user
    """
    if section not in SECTION_FIELDS_MAP:
        raise HTTPException(
            status_code=400, detail=f"Unknown section '{section}'. Valid: {list(SECTION_FIELDS_MAP.keys())}")

    target_user = db.query(models.User).filter(
        models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    fields = SECTION_FIELDS_MAP[section]

    # Clear the actual data fields
    for field in fields:
        if hasattr(target_user, field):
            setattr(target_user, field, None)

    # Special handling for KYC
    if section == "kyc":
        target_user.is_verified = False
        target_user.verification_status = "unverified"

    # Remove from approved_sections
    approved = dict(target_user.approved_sections or {})
    approved.pop(section, None)
    target_user.approved_sections = dict(approved)

    # Remove from pending_changes
    pending = dict(target_user.pending_changes or {})
    for field in fields:
        pending.pop(field, None)
    target_user.pending_changes = dict(pending)

    # Remove from rejected_sections
    rejected = dict(target_user.rejected_sections or {})
    rejected.pop(section, None)
    target_user.rejected_sections = dict(rejected)

    # Recalculate trust (will deduct points for this section)
    from backend.services.trust_service import TrustService
    TrustService.apply_profile_update_boost(db, target_user)

    db.commit()
    db.refresh(target_user)

    section_label = SECTION_LABELS.get(section, section)
    pts_after = target_user.trust_score or 0

    # Notify user
    create_user_notification(
        db, user_id,
        "⚠️ Profile Section Removed",
        f"Your '{section_label}' data has been removed by an admin. "
        f"This may have affected your trust score. Please resubmit if needed."
    )

    # Build clean section name without kyc
    clean_section_name = section_label.replace(
        " (KYC)", "").replace("KYC", "Identity Verification")
    log_action(
        db,
        admin_id=admin.id,
        action="PROFILE_REMOVED",
        ip=request.client.host,
        target_id=user_id,
        details={
            "section": clean_section_name,
            "reason": reason.strip() if reason.strip() else f"Admin removed {clean_section_name} from {target_user.name}",
            "user": target_user.name
        }
    )

    return {
        "success": True,
        "message": f"Section '{section_label}' removed from user #{user_id}.",
        "trust_score_after": pts_after,
        "section": section
    }


@router.post("/users/{user_id}/revoke-sessions", status_code=status.HTTP_200_OK)
def admin_revoke_user_sessions(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    target_user = db.query(models.User).filter(
        models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    try:
        target_user.token_version += 1
        target_user.account_status = "frozen"

        log_action(
            db,
            admin_id=admin.id,
            action="REMOTE_LOGOUT_KILLSWITCH",
            ip=request.client.host,
            target_id=user_id,
            details={"email": target_user.email,
                     "note": "Sessions revoked & frozen"}
        )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Security protocol execution failed.")

    return {"message": f"Kill switch activated for {target_user.name}."}

# --- 10. ACCOUNT STATUS UPDATE ---


@router.patch("/update-account-status/{user_id}")
def update_account_status(
    request: Request,
    user_id: int,
    new_status: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    ALLOWED_STATUSES = ["active", "frozen", "archived", "banned"]

    if new_status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: '{new_status}'. Allowed: {', '.join(ALLOWED_STATUSES)}"
        )

    target_user = db.query(models.User).filter(
        models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    target_user.account_status = new_status

    log_action(
        db,
        admin_id=admin.id,
        action="STATUS_CHANGE",
        target_id=user_id,
        ip=request.client.host,
        details=f"Status changed to: {new_status}"
    )

    db.commit()
    return {"message": f"Account for {target_user.email} is now {new_status}"}

# --- 11. USER UNLOCK PIN ---


@router.post("/users/{user_id}/unlock-pin", status_code=status.HTTP_200_OK)
def admin_unlock_user_pin(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    target_user = db.query(models.User).filter(
        models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    target_user.failed_pin_attempts = 0
    target_user.pin_locked_until = None

    if target_user.account_status == "frozen":
        target_user.account_status = "active"

    log_action(
        db,
        admin_id=admin.id,
        action="ADMIN_PIN_UNLOCK",
        ip=request.client.host,
        target_id=user_id,
        details={"message": "PIN lockout manually lifted by Admin"}
    )

    db.commit()
    return {"message": f"Security lockout lifted for {target_user.name}."}

# --- 12. FREEZE ---


@router.post("/users/{user_id}/freeze", status_code=status.HTTP_200_OK)
def admin_force_freeze(
    request: Request,
    user_id: int,
    reason: str = "Security review by administrator.",
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.account_status = "frozen"

    # Invalidate all active sessions by bumping token_version
    if hasattr(user, 'token_version'):
        user.token_version = (user.token_version or 0) + 1

    # Notify user in-app
    create_user_notification(
        db, user.id,
        "⚠️ Account Freeze",
        f"Your account has been temporarily frozen. Reason: {reason}. "
        "You will receive an email with instructions to restore access."
    )

    # Send unfreeze email so the real user can recover access
    try:
        from backend.core.security import create_unfreeze_token, send_gmail_otp
        import os
        if hasattr(user, 'last_unfreeze_token'):
            freeze_token, freeze_jti = create_unfreeze_token(user.email)
            user.last_unfreeze_token = freeze_jti
            email_user = os.getenv("EMAIL_USER", "")
            email_pass = os.getenv("EMAIL_PASS", "")
            if email_user and email_pass:
                import smtplib
                from email.message import EmailMessage as _EM
                msg = _EM()
                msg["Subject"] = "[Filmnance] Your account has been frozen"
                msg["From"] = f"Filmnance Security <{email_user}>"
                msg["To"] = user.email
                msg.set_content(
                    f"Dear {user.name},\n\n"
                    f"Your Filmnance account has been frozen.\n"
                    f"Reason: {reason}\n\n"
                    f"If this was not you, or if you believe this is an error, "
                    f"please contact support immediately.\n\n"
                    f"Unfreeze token (share with admin): {freeze_token[:20]}...\n\n"
                    f"— Filmnance Security Team"
                )
                with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
                    s.login(email_user, email_pass)
                    s.send_message(msg)
    except Exception as e:
        print(f"Freeze email error: {e}")

    # Notify ALL admins about the freeze
    create_admin_alert(
        db,
        "❄️ Account Freeze",
        f"Admin manually froze {user.name} ({user.email}). Reason: {reason}. "
        f"Token invalidated — active sessions ended immediately."
    )
    # (title is "Account Freeze" — matches audit log label)

    # Send freeze email to REAL_EMAIL
    try:
        import smtplib as _s2
        import os as _o2
        from email.message import EmailMessage as _EM2
        _eu2 = _o2.getenv("EMAIL_USER", "")
        _ep2 = _o2.getenv("EMAIL_PASS", "")
        _re2 = _o2.getenv("REAL_EMAIL", _eu2)
        if _eu2 and _ep2 and _re2:
            _mf = _EM2()
            _mf["Subject"] = f"[Filmnance FREEZE] Account Freeze ({user.name} <{user.email}>)"
            _mf["From"] = f"Filmnance Admin <{_eu2}>"
            _mf["To"] = _re2
            _mf.set_content(
                f"ACCOUNT FREEZE\n{'='*50}\nUser: {user.name}\nEmail: {user.email}\n{'='*50}\n\nReason: {reason}\n\n---\nThis action was taken by Filmnance Admin.\n")
            with _s2.SMTP_SSL("smtp.gmail.com", 465) as _srv:
                _srv.login(_eu2, _ep2)
                _srv.send_message(_mf)
    except Exception:
        pass
    log_action(db, admin.id, "MANUAL_FREEZE",
               request.client.host, target_id=user.id,
               details={"user": user.name, "email": user.email, "reason": reason})

    db.commit()
    return {"message": f"Account for {user.name} frozen. Reason: {reason}"}

# --- 13. UNFREEZE ---


@router.post("/users/{user_id}/unban", status_code=status.HTTP_200_OK)
def admin_unfreeze_user(
    request: Request,
    user_id: int,
    message: str = Query(default=""),
    subject: str = Query(default=""),
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    was_archived = user.account_status == "archived"
    user.account_status = "active"
    user.failed_pin_attempts = 0
    user.pin_locked_until = None

    restore_msg = message.strip() if message.strip(
    ) else "Your account has been restored. You may now log in again."

    if was_archived:
        action_label = "UNARCHIVE_USER"
        notif_title = "✅ Account Restored"
        notif_msg = restore_msg
        admin_title = "✅ Account Unarchived"
        admin_msg = f"{user.name} ({user.email}) account has been unarchived."
    else:
        action_label = "ADMIN_UNFREEZE"
        notif_title = "✅ Account Unfreeze"
        notif_msg = "Your account has been unfrozen and reactivated. You may now log in and resume transactions."
        admin_title = "✅ Account Unfreeze"
        admin_msg = f"{user.name} ({user.email}) has been unfrozen and access restored."

    create_user_notification(db, user.id, notif_title, notif_msg)
    create_admin_alert(db, admin_title, admin_msg)

    # Send email to user
    import os
    import smtplib
    from email.message import EmailMessage as _EM2
    _eu2 = os.getenv("EMAIL_USER", "")
    _ep2 = os.getenv("EMAIL_PASS", "")
    if _eu2 and _ep2 and user.email:
        try:
            _m2 = _EM2()
            _real2 = os.getenv("REAL_EMAIL", _eu2)
            _action_label = "Account Restored" if was_archived else "Account Unfreeze"
            _m2["Subject"] = f"[Filmnance {_action_label.upper()}] {subject.strip() or _action_label} ({user.name} <{user.email}>)"
            _m2["From"] = f"Filmnance Admin <{_eu2}>"
            _m2["To"] = _real2
            _m2.set_content(
                f"{'ACCOUNT RESTORED' if was_archived else 'ACCOUNT UNFROZEN'}\n"
                f"{'='*50}\n"
                f"User: {user.name}\n"
                f"Email: {user.email}\n"
                f"{'='*50}\n\n"
                f"{restore_msg}\n\n"
                f"---\n"
                f"This action was taken by Filmnance Admin.\n"
            )
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as _s2:
                _s2.login(_eu2, _ep2)
                _s2.send_message(_m2)
        except Exception:
            pass

    log_action(db, admin.id, action_label,
               request.client.host, target_id=user.id,
               details={"user": user.name, "email": user.email, "reason": restore_msg})

    db.commit()
    return {"message": f"Account for {user.name} has been restored."}

# --- 14. ARCHIVING ---


@router.delete("/archive-user/{user_id}")
def archive_user(
    request: Request,
    user_id: int,
    reason: str = Query(default=""),
    subject: str = Query(default=""),
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    active_debt = db.query(models.Loan).filter(
        models.Loan.owner_id == user_id,
        models.Loan.status.in_(["approved", "disbursed"])
    ).first()

    if active_debt:
        raise HTTPException(
            status_code=400, detail="Cannot archive user with outstanding active loans.")

    user.account_status = "archived"
    archive_reason = reason.strip() if reason.strip() else "No reason provided"

    # Send email notification to user
    import os
    import smtplib
    from email.message import EmailMessage as _EM
    _eu = os.getenv("EMAIL_USER", "")
    _ep = os.getenv("EMAIL_PASS", "")
    if _eu and _ep and user.email:
        try:
            _m = _EM()
            _real = os.getenv("REAL_EMAIL", _eu)
            _m["Subject"] = f"[Filmnance ARCHIVE] {subject.strip() or 'Account Archived'} ({user.name} <{user.email}>)"
            _m["From"] = f"Filmnance Admin <{_eu}>"
            _m["To"] = _real
            _m.set_content(
                f"ACCOUNT ARCHIVED\n"
                f"{'='*50}\n"
                f"User: {user.name}\n"
                f"Email: {user.email}\n"
                f"{'='*50}\n\n"
                f"Reason: {archive_reason}\n\n"
                f"---\n"
                f"This action was taken by Filmnance Admin.\n"
            )
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as _s:
                _s.login(_eu, _ep)
                _s.send_message(_m)
        except Exception:
            pass

    log_action(
        db,
        admin_id=admin.id,
        action="ARCHIVE_USER",
        target_id=user_id,
        ip=request.client.host,
        details={"user": user.name, "email": user.email,
                 "reason": archive_reason}
    )

    db.commit()
    return {"message": f"User {user.name} archived."}


# --- 15. SEND EMERGENCY CONTACT EMAIL ---

@router.post("/users/{user_id}/contact-emergency")
def send_emergency_contact_email(
    request: Request,
    user_id: int,
    subject: str,
    body: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """
    Sends an email to the producer's emergency contact via the backend
    using the REAL_EMAIL alias (same system as OTP emails).
    """
    import os
    from backend.core import security as _sec

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.emergency_contact_email:
        raise HTTPException(
            status_code=400, detail="This user has no emergency contact email.")

    # Send via the same Gmail SMTP system used for OTPs
    # REAL_EMAIL in .env is your Gmail — emergency contact email is an alias
    # so the message goes to your real Gmail inbox
    email_user = os.getenv("EMAIL_USER", "")
    email_pass = os.getenv("EMAIL_PASS", "")
    # fallback to sender if not set
    real_email = os.getenv("REAL_EMAIL", email_user)

    if not email_user or not email_pass:
        raise HTTPException(
            status_code=500,
            detail="Email not configured. Set EMAIL_USER and EMAIL_PASS in .env"
        )

    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = f"[Filmnance EC] {subject}"
        msg["From"] = f"Filmnance Admin <{email_user}>"
        # Send to REAL_EMAIL (your Gmail inbox) — the alias forwards to you anyway
        msg["To"] = real_email
        # so you can reply directly to EC
        msg["Reply-To"] = user.emergency_contact_email
        full_body = (
            f"EMERGENCY CONTACT MESSAGE\n"
            f"{'='*50}\n"
            f"Producer: {user.name}\n"
            f"EC Name: {user.emergency_contact_name or '—'}\n"
            f"EC Email: {user.emergency_contact_email}\n"
            f"{'='*50}\n\n"
            f"{body}\n\n"
            f"---\n"
            f"This message was sent by Filmnance Admin.\n"
            f"Reply-To is set to the emergency contact email.\n"
        )
        msg.set_content(full_body)

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(email_user, email_pass)
            server.send_message(msg)
        log_action(db, admin.id, "EMERGENCY_CONTACT_EMAIL",
                   request.client.host, target_id=user_id,
                   details={"user": user.name, "contact_email": user.emergency_contact_email, "subject": subject})
        db.commit()
        return {"message": f"Email sent to emergency contact of {user.name}."}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Email send failed: {str(e)}")


# --- 15b. SEND MESSAGE TO USER DIRECTLY ---

class DirectMessagePayload(BaseModel):
    subject: str = ""
    body: str = ""


@router.post("/users/{user_id}/send-message")
def send_message_to_user(
    request: Request,
    user_id: int,
    payload: DirectMessagePayload,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Sends an email directly to the user's registered email address."""
    import os
    import smtplib
    from email.message import EmailMessage

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.email:
        raise HTTPException(
            status_code=400, detail="This user has no email address.")

    email_user = os.getenv("EMAIL_USER", "")
    email_pass = os.getenv("EMAIL_PASS", "")
    if not email_user or not email_pass:
        raise HTTPException(
            status_code=500, detail="Email credentials not configured.")

    subject_text = payload.subject.strip() or "[Filmnance] Message from Admin"
    body_text = payload.body.strip() or "No message body provided."

    try:
        real_email = os.getenv("REAL_EMAIL", email_user)
        msg = EmailMessage()
        msg["Subject"] = f"[Filmnance DM] {subject_text} (To: {user.name} <{user.email}>)"
        msg["From"] = f"Filmnance Admin <{email_user}>"
        msg["To"] = real_email
        msg["Reply-To"] = user.email
        plain_body = (
            f"DIRECT MESSAGE TO USER\n"
            f"{'='*50}\n"
            f"User: {user.name}\n"
            f"Email: {user.email}\n"
            f"Subject: {subject_text}\n"
            f"{'='*50}\n\n"
            f"{body_text}\n\n"
            f"---\n"
            f"This message was sent via Filmnance Admin Panel.\n"
            f"Reply-To is set to the user email so you can reply directly.\n"
        )
        msg.set_content(plain_body)
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(email_user, email_pass)
            server.send_message(msg)
        log_action(db, admin.id, "USER_MESSAGE_SENT",
                   request.client.host, target_id=user_id,
                   details={"role": user.filmmaker_role or "Producer",
                            "role_label": user.filmmaker_role or "User",
                            "user": user.name, "email": user.email, "subject": subject_text})
        db.commit()
        return {"message": f"Message sent to {user.name} ({user.email})."}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Email send failed: {str(e)}")


# --- 15. AUDIT ---


@router.get("/audit/logs")
def get_audit_logs(
    admin_id: Optional[int] = None,
    action: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    query = db.query(models.AuditLog)
    if admin_id:
        query = query.filter(models.AuditLog.admin_id == admin_id)
    if action:
        query = query.filter(models.AuditLog.action.ilike(f"%{action}%"))
    logs = query.order_by(models.AuditLog.timestamp.desc()).all()
    # Build a user name lookup for all relevant user ids
    all_user_ids = set()
    for l in logs:
        if l.admin_id:
            all_user_ids.add(l.admin_id)
        if l.target_id:
            all_user_ids.add(l.target_id)
    user_map = {}
    if all_user_ids:
        users = db.query(models.User.id, models.User.name).filter(
            models.User.id.in_(all_user_ids)).all()
        user_map = {u.id: u.name for u in users}

    # Build installment count per user (total loan schedule entries per user across all loans)
    def get_user_installment_count(user_id):
        if not user_id:
            return None
        count = db.query(models.LoanSchedule).join(
            models.Loan, models.LoanSchedule.loan_id == models.Loan.id
        ).filter(models.Loan.owner_id == user_id).count()
        return count if count > 0 else None

    result = []
    for l in logs:
        # target_id should always be the subject user's actual user ID
        # For loan/delay/monthly actions the target_id may be a loan id — resolve it
        display_user_id = l.target_id
        user_name = None

        # Try to resolve the user from target_id
        if l.target_id and l.target_id in user_map:
            user_name = user_map[l.target_id]
        elif l.target_id:
            # target_id might be a loan id — look up the loan's owner
            loan_owner = db.query(models.Loan).filter(models.Loan.id == l.target_id).first()
            if loan_owner:
                display_user_id = loan_owner.owner_id
                user_name = user_map.get(loan_owner.owner_id)
                if not user_name:
                    owner_obj = db.query(models.User).filter(models.User.id == loan_owner.owner_id).first()
                    if owner_obj:
                        user_name = owner_obj.name

        if not user_name:
            user_name = user_map.get(l.admin_id) or '—'

        installment_count = get_user_installment_count(display_user_id) if display_user_id else None

        result.append({
            "id": l.id,
            "admin_id": l.admin_id,
            "action": l.action,
            "target_id": display_user_id,  # Always the user's actual ID
            "ip_address": l.ip_address,
            "details": l.details,
            "user_name": user_name,
            "installment_count": installment_count,
            "timestamp": (l.timestamp.isoformat() + "Z") if l.timestamp and l.timestamp.tzinfo is None
            else (l.timestamp.isoformat() if l.timestamp else None),
        })
    return result


# --- 16. REPAYMENT SCHEDULE ---

@router.get("/loans/{loan_id}/schedule")
def get_loan_schedule(
    loan_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.loan_id == loan_id
    ).order_by(models.LoanSchedule.installment_number).all()

    return [
        {
            "id": s.id,
            "installment_number": s.installment_number,
            "due_date": s.due_date.isoformat() if s.due_date else None,
            "amount_due": float(s.amount_due),
            "status": s.status,
            "delay_requested": s.delay_requested or False,
            "delay_status": s.delay_status or None,
            "delay_reason": s.delay_reason or None,
            "is_grace_update": s.status == "grace_update",
        }
        for s in schedule
    ]


# --- 17. GRANT PAYMENT DELAY ---

@router.post("/loans/{loan_id}/schedule/{schedule_id}/grant-delay")
def grant_payment_delay(
    request: Request,
    loan_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.id == schedule_id,
        models.LoanSchedule.loan_id == loan_id
    ).first()

    if not schedule:
        raise HTTPException(
            status_code=404, detail="Schedule installment not found.")
    if schedule.status == "paid":
        raise HTTPException(
            status_code=400, detail="Installment already paid.")

    original_due = schedule.due_date
    if original_due.tzinfo is None:
        from datetime import timezone as tz
        original_due = original_due.replace(tzinfo=tz.utc)
    schedule.due_date = original_due + timedelta(days=30)

    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if loan:
        create_user_notification(
            db, loan.owner_id,
            "Payment Delay Granted ✅",
            f"Your installment #{schedule.installment_number} for '{loan.project_title}' "
            f"has been extended by 30 days. New due date: {schedule.due_date.strftime('%b %d, %Y')}."
        )

    log_action(db, admin_id=admin.id, action="GRANT_PAYMENT_DELAY",
               ip=request.client.host, target_id=loan_id,
               details=f"Installment #{schedule.installment_number} extended 30 days.")

    db.commit()
    return {"message": f"Due date extended by 30 days for installment #{schedule.installment_number}."}


# --- 18. FLAG INSTALLMENT OVERDUE ---

@router.post("/loans/{loan_id}/schedule/{schedule_id}/flag-overdue")
def flag_installment_overdue(
    request: Request,
    loan_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.id == schedule_id,
        models.LoanSchedule.loan_id == loan_id
    ).first()

    if not schedule:
        raise HTTPException(
            status_code=404, detail="Schedule installment not found.")

    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if loan:
        create_user_notification(
            db, loan.owner_id,
            "⚠️ Payment Overdue",
            f"Installment #{schedule.installment_number} for '{loan.project_title}' "
            f"is officially flagged as overdue. Please contact support immediately."
        )

    log_action(db, admin_id=admin.id, action="FLAG_OVERDUE_INSTALLMENT",
               ip=request.client.host, target_id=loan_id,
               details=f"Installment #{schedule.installment_number} flagged overdue.")

    db.commit()
    return {"message": f"Installment #{schedule.installment_number} flagged as overdue. Producer notified."}


# --- 18b. SEND 3-DAY DUE-SOON WARNINGS ---
# Called by a scheduler or manually; notifies users whose next installment
# is due within 3 days and hasn't been notified yet.

@router.post("/loans/send-due-warnings")
def send_due_warnings(
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    from datetime import timezone as tz
    now = datetime.now(tz.utc)
    warning_window = now + timedelta(days=3)
    notified = 0

    schedules = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.status == "unpaid",
        models.LoanSchedule.due_date >= now,
        models.LoanSchedule.due_date <= warning_window,
        models.LoanSchedule.delay_status.notin_(
            ["pending", "approved"]) if True else True,
    ).all()

    for s in schedules:
        loan = db.query(models.Loan).filter(
            models.Loan.id == s.loan_id,
            models.Loan.status == "disbursed"
        ).first()
        if not loan:
            continue
        days_left = max(0, (s.due_date.replace(
            tzinfo=tz.utc if s.due_date.tzinfo is None else None) - now).days)
        create_user_notification(
            db, loan.owner_id,
            "⏰ Payment Due Soon",
            f"Installment #{s.installment_number} for '{loan.project_title}' is due in "
            f"{days_left} day(s) on {s.due_date.strftime('%b %d, %Y')}. "
            f"Amount: ₱{float(s.amount_due):,.2f}. "
            f"You can submit a delay request if you need more time (max 5 delays per loan)."
        )
        notified += 1

    db.commit()
    return {"message": f"Sent {notified} due-soon warning(s)."}


@router.get("/delays/all")
def get_all_delay_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Returns all loan schedule records that have delay fields set, with optional status filter."""
    query = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.delay_requested == True
    )
    if status:
        query = query.filter(models.LoanSchedule.delay_status == status)
    schedules = query.order_by(models.LoanSchedule.due_date.desc()).all()

    result = []
    for s in schedules:
        loan = db.query(models.Loan).filter(
            models.Loan.id == s.loan_id).first()
        owner = db.query(models.User).filter(
            models.User.id == loan.owner_id).first() if loan else None
        # Extract phase from project_description (canonical source)
        import re as _re2
        _phase_all = ''
        if loan and loan.project_description:
            _pm2 = _re2.search(r'Phase:\s*([^|]+)', loan.project_description, _re2.IGNORECASE)
            if _pm2:
                _phase_all = _pm2.group(1).strip()
        if not _phase_all and loan:
            _phase_all = getattr(loan, 'current_stage', '') or ''
        result.append({
            "id": s.id,
            "loan_id": s.loan_id,
            "installment_number": s.installment_number,
            "due_date": s.due_date.isoformat() if s.due_date else None,
            "delay_requested_at": s.delay_requested_at.isoformat() if getattr(s, 'delay_requested_at', None) else None,
            "amount_due": float(s.amount_due),
            "status": s.status,
            "delay_status": s.delay_status,
            "delay_reason": getattr(s, 'delay_reason', None),
            "delay_proof_url": getattr(s, 'delay_proof_url', None),
            "loan": {
                "id": loan.id,
                "project_title": loan.project_title,
                "amount": float(loan.amount),
                "current_stage": _phase_all,
                "film_production_phase": _phase_all,
                "delay_attempts_used": getattr(loan, 'delay_attempts_used', 0),
            } if loan else None,
            "producer": {
                "id": owner.id,
                "name": owner.name,
                "email": owner.email,
                "filmmaker_role": getattr(owner, 'filmmaker_role', None),
            } if owner else None,
        })
    return result


@router.get("/delays/pending")
def get_pending_delay_requests(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    schedules = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.delay_status == "pending"
    ).order_by(models.LoanSchedule.due_date.asc()).all()

    result = []
    for s in schedules:
        loan = db.query(models.Loan).filter(
            models.Loan.id == s.loan_id).first()
        owner = db.query(models.User).filter(
            models.User.id == loan.owner_id).first() if loan else None
        # Extract phase from project_description (canonical source)
        import re as _re
        _phase_str = ''
        if loan and loan.project_description:
            _pm = _re.search(r'Phase:\s*([^|]+)', loan.project_description, _re.IGNORECASE)
            if _pm:
                _phase_str = _pm.group(1).strip()
        if not _phase_str and loan:
            _phase_str = getattr(loan, 'current_stage', '') or ''
        result.append({
            "id": s.id,
            "loan_id": s.loan_id,
            "installment_number": s.installment_number,
            "due_date": s.due_date.isoformat() if s.due_date else None,
            "delay_requested_at": s.delay_requested_at.isoformat() if getattr(s, 'delay_requested_at', None) else None,
            "amount_due": float(s.amount_due),
            "status": s.status,
            "delay_status": s.delay_status,
            "delay_reason": getattr(s, 'delay_reason', None),
            "delay_proof_url": getattr(s, 'delay_proof_url', None),
            "loan": {
                "id": loan.id,
                "project_title": loan.project_title,
                "amount": float(loan.amount),
                "current_stage": _phase_str,  # Always from project_description
                "delay_attempts_used": getattr(loan, 'delay_attempts_used', 0),
            } if loan else None,
            "producer": {
                "id": owner.id,
                "name": owner.name,
                "email": owner.email,
                "filmmaker_role": getattr(owner, 'filmmaker_role', None),
            } if owner else None,
        })
    return result


@router.get("/grace-updates")
def get_grace_updates(
    status: str = "pending",
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Admin endpoint to review monthly production updates (with photos)."""
    try:
        updates = db.query(models.GraceUpdate).filter(
            models.GraceUpdate.status == status
        ).order_by(models.GraceUpdate.created_at.desc()).all()
    except Exception:
        return []

    result = []
    for u in updates:
        loan = db.query(models.Loan).filter(
            models.Loan.id == u.loan_id).first()
        user = db.query(models.User).filter(
            models.User.id == u.user_id).first()
        schedule = None
        if u.schedule_id:
            schedule = db.query(models.LoanSchedule).filter(
                models.LoanSchedule.id == u.schedule_id).first()

        # Get the ACTUAL production phase from project_description
        # (more reliable than current_stage which may be stale)
        actual_phase = None
        if loan and loan.project_description:
            import re as _re
            _pm = _re.search(
                r'Phase:\s*([^|]+)', loan.project_description, _re.IGNORECASE)
            if _pm:
                actual_phase = _pm.group(1).strip()
        if not actual_phase and loan:
            actual_phase = getattr(loan, 'current_stage', None)

        result.append({
            "id": u.id,
            "loan_id": u.loan_id,
            "schedule_id": u.schedule_id,
            "reference": u.reference,
            "update_text": u.update_text,
            "photo_url": u.photo_url,
            "status": u.status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "installment_number": getattr(schedule, 'installment_number', None),
            "due_date": schedule.due_date.isoformat() if schedule and schedule.due_date else None,
            "amount_due": float(schedule.amount_due) if schedule and schedule.amount_due else None,
            "loan": {
                "id": loan.id,
                "project_title": loan.project_title,
                "current_stage": actual_phase,
                "grace_months_remaining": getattr(loan, 'grace_months_remaining', 0),
                "film_production_phase": getattr(loan, 'film_production_phase', None),
            } if loan else None,
            "producer": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "filmmaker_role": getattr(user, 'filmmaker_role', None),
            } if user else None,
        })
    return result


@router.post("/grace-updates/{update_id}/approve")
def approve_grace_update(
    update_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Approve a monthly production update. Consumes one grace month if the
    loan is still within its Development/Pre-Production grace policy
    (awarding the +5 completion bonus on the 3rd month), otherwise awards
    the regular +2 trust points for a normal-phase monthly update."""
    upd = db.query(models.GraceUpdate).filter(
        models.GraceUpdate.id == update_id).first()
    if not upd:
        raise HTTPException(status_code=404, detail="Update not found.")
    if upd.status == "approved":
        return {"message": "Already approved."}

    loan = db.query(models.Loan).filter(models.Loan.id == upd.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    owner = loan.owner

    schedule = None
    if upd.schedule_id:
        schedule = db.query(models.LoanSchedule).filter(
            models.LoanSchedule.id == upd.schedule_id).first()

    upd.status = "approved"
    upd.reviewed_at = datetime.now(timezone.utc)
    upd.reviewed_by = admin.id

    bonus_result = {"bonus": 0, "grace_completed": False}
    if schedule and owner:
        bonus_result = engine.approve_monthly_update(
            db, loan, schedule, owner)
    elif loan and hasattr(loan, 'grace_months_remaining'):
        # Fallback for legacy rows with no linked schedule
        loan.grace_months_remaining = max(
            0, (loan.grace_months_remaining or 0) - 1)

    create_user_notification(
        db, loan.owner_id,
        "✅ Monthly Update Approved",
        f"Your production update (Ref: {upd.reference}) for '{loan.project_title}' "
        f"has been approved. "
        f"Grace months remaining: {getattr(loan, 'grace_months_remaining', 0)}."
        + (" You've earned +5 trust points for completing your grace period!"
           if bonus_result.get("grace_completed") else
           (" +2 trust points awarded." if bonus_result.get("bonus") == 2 else ""))
    )

    _r_phase = getattr(loan, 'current_stage', '') or ''
    if not _r_phase and loan.project_description:
        import re as _re2
        _rp = _re2.search(
            r'Phase:\s*([^|]+)', loan.project_description or '', _re2.IGNORECASE)
        if _rp:
            _r_phase = _rp.group(1).strip()
    log_action(db, admin.id, "MONTHLY_APPROVED",
               request.client.host if hasattr(
                   request, 'client') and request.client else "127.0.0.1",
               target_id=upd.loan_id,
               details={
                   "project": loan.project_title if loan else "—",
                   "production_phase": _r_phase or "—",
                   "user": loan.owner.name if loan and loan.owner else "—"
               })
    db.commit()
    return {
        "message": "Monthly update approved.",
        "grace_months_remaining": getattr(loan, 'grace_months_remaining', 0) if loan else None,
        "trust_bonus": bonus_result.get("bonus", 0),
    }


@router.post("/grace-updates/{update_id}/reject")
def reject_grace_update(
    update_id: int,
    request: Request,
    reason: str = Form(...),
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Reject a monthly production update. The producer may submit again
    within the same installment period since rejection doesn't consume the
    single monthly attempt."""
    upd = db.query(models.GraceUpdate).filter(
        models.GraceUpdate.id == update_id).first()
    if not upd:
        raise HTTPException(status_code=404, detail="Update not found.")
    if upd.status == "rejected":
        return {"message": "Already rejected."}

    loan = db.query(models.Loan).filter(models.Loan.id == upd.loan_id).first()
    schedule = None
    if upd.schedule_id:
        schedule = db.query(models.LoanSchedule).filter(
            models.LoanSchedule.id == upd.schedule_id).first()

    upd.status = "rejected"
    upd.reviewed_at = datetime.now(timezone.utc)
    upd.reviewed_by = admin.id

    if loan and schedule:
        engine.reject_monthly_update(db, loan, schedule)
        # If the schedule had already been auto-pushed forward due to prior
        # admin inaction on this same request, the producer now must pay
        # immediately and forfeits any remaining grace-period protection.
        if (getattr(loan, 'schedule_push_days', 0) or 0) > 0:
            engine.revoke_remaining_grace(db, loan)

    if loan:
        create_user_notification(
            db, loan.owner_id,
            "❌ Monthly Update Rejected",
            f"Your production update (Ref: {upd.reference}) for '{loan.project_title}' "
            f"was rejected. Reason: {reason[:200]}. You may submit a new update for this "
            f"period."
        )

    log_action(db, admin.id, "MONTHLY_REJECTED",
               request.client.host if hasattr(
                   request, 'client') and request.client else "127.0.0.1",
               target_id=upd.loan_id,
               details={
                   "project": loan.project_title if loan else "—",
                   "reason": reason[:150],
                   "user": loan.owner.name if loan and loan.owner else "—"
               })
    db.commit()
    return {"message": "Monthly update rejected. Producer has been notified."}


# --- 20. APPROVE DELAY REQUEST ---

@router.post("/delays/{schedule_id}/approve")
def approve_delay_request(
    request: Request,
    schedule_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.id == schedule_id
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Installment not found.")
    if getattr(schedule, 'delay_status', None) != "pending":
        raise HTTPException(
            status_code=400, detail="No pending delay request for this installment.")

    original = schedule.due_date
    if original.tzinfo is None:
        from datetime import timezone as tz
        original = original.replace(tzinfo=tz.utc)
    schedule.due_date = original + timedelta(days=30)
    schedule.delay_status = "approved"

    loan = db.query(models.Loan).filter(
        models.Loan.id == schedule.loan_id).first()
    if loan:
        create_user_notification(
            db, loan.owner_id,
            "Payment Delay Approved ✅",
            f"Your delay request for installment #{schedule.installment_number} of "
            f"'{loan.project_title}' was approved. New due date: {schedule.due_date.strftime('%b %d, %Y')}."
        )

    _phase = ''
    if loan:
        _phase = getattr(loan, 'current_stage', '') or ''
        if not _phase and loan.project_description:
            import re as _re
            _pm = _re.search(
                r'Phase:\s*([^|]+)', loan.project_description or '', _re.IGNORECASE)
            if _pm:
                _phase = _pm.group(1).strip()
    log_action(db, admin.id, "DELAY_APPROVED",
               request.client.host, target_id=loan.owner_id if loan else schedule.loan_id,
               details={
                   "project": loan.project_title if loan else "—",
                   "production_phase": _phase or "—",
                   "user": loan.owner.name if loan and loan.owner else "—"
               })
    db.commit()
    return {"message": f"Delay approved. Installment #{schedule.installment_number} extended 30 days."}


# --- 21. DECLINE DELAY REQUEST ---

@router.post("/delays/{schedule_id}/decline")
def decline_delay_request(
    request: Request,
    schedule_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    schedule = db.query(models.LoanSchedule).filter(
        models.LoanSchedule.id == schedule_id
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Installment not found.")
    if getattr(schedule, 'delay_status', None) != "pending":
        raise HTTPException(
            status_code=400, detail="No pending delay request for this installment.")

    schedule.delay_status = "declined"

    loan = db.query(models.Loan).filter(
        models.Loan.id == schedule.loan_id).first()
    if loan:
        create_user_notification(
            db, loan.owner_id,
            "⚠️ Delay Request Declined",
            f"Your delay request for installment #{schedule.installment_number} of "
            f"'{loan.project_title}' was declined. Original due date stands: "
            f"{schedule.due_date.strftime('%b %d, %Y')}. Please settle on time."
        )

    _d_reason = getattr(schedule, 'delay_reason', '') or ''
    log_action(db, admin.id, "DELAY_REJECTED",
               request.client.host, target_id=loan.owner_id if loan else schedule.loan_id,
               details={
                   "project": loan.project_title if loan else "—",
                   "reason": _d_reason[:120] if _d_reason else "Declined by admin",
                   "user": loan.owner.name if loan and loan.owner else "—"
               })
    db.commit()
    return {"message": f"Delay request declined. Producer has been notified."}


# ── REPAYMENT RECEIPTS (Admin confirms user-submitted proof) ─────────────────

@router.get("/repayment-receipts/pending")
def get_pending_repayment_receipts(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Returns all pending repayment receipts for admin review."""
    try:
        receipts = db.query(models.RepaymentReceipt).filter(
            models.RepaymentReceipt.status == "pending"
        ).order_by(models.RepaymentReceipt.submitted_at.desc()).all()
    except Exception:
        return []  # Table may not exist yet — return empty

    result = []
    for r in receipts:
        loan = db.query(models.Loan).filter(
            models.Loan.id == r.loan_id).first()
        user = db.query(models.User).filter(models.User.id ==
                                            loan.owner_id).first() if loan else None
        # Find the current unpaid schedule item for due_date
        due_date = None
        if loan:
            next_sched = db.query(models.LoanSchedule).filter(
                models.LoanSchedule.loan_id == loan.id,
                models.LoanSchedule.status == "unpaid"
            ).order_by(models.LoanSchedule.due_date).first()
            if next_sched:
                due_date = next_sched.due_date.isoformat() if next_sched.due_date else None
        result.append({
            "id": r.id,
            "loan_id": r.loan_id,
            "project_title": loan.project_title if loan else "—",
            "producer_name": user.name if user else "—",
            "producer_id": user.id if user else None,
            "filmmaker_role": getattr(user, "filmmaker_role", None) or "—",
            "amount": float(r.amount),
            "method": r.method,
            "reference_number": r.reference_number,
            "proof_url": r.proof_url,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "due_date": due_date,
        })
    return result


@router.get("/repayment-receipts/approved")
def get_approved_repayment_receipts(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Returns all confirmed repayment receipts."""
    try:
        receipts = db.query(models.RepaymentReceipt).filter(
            models.RepaymentReceipt.status == "confirmed"
        ).order_by(models.RepaymentReceipt.confirmed_at.desc()).all()
    except Exception:
        return []

    result = []
    for r in receipts:
        loan = db.query(models.Loan).filter(
            models.Loan.id == r.loan_id).first()
        user = db.query(models.User).filter(models.User.id ==
                                            loan.owner_id).first() if loan else None
        result.append({
            "id": r.id,
            "loan_id": r.loan_id,
            "project_title": loan.project_title if loan else "—",
            "producer_name": user.name if user else "—",
            "producer_id": user.id if user else None,
            "filmmaker_role": getattr(user, "filmmaker_role", None) or "—",
            "amount": float(r.amount),
            "method": r.method,
            "reference_number": r.reference_number,
            "proof_url": r.proof_url,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "confirmed_at": r.confirmed_at.isoformat() if r.confirmed_at else None,
            "due_date": None,
        })
    return result


@router.post("/repayment-receipts/{receipt_id}/confirm")
def confirm_repayment_receipt(
    receipt_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Admin confirms proof → triggers actual loan repayment + returns funds to treasury."""
    receipt = db.query(models.RepaymentReceipt).filter(
        models.RepaymentReceipt.id == receipt_id
    ).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found.")
    if receipt.status != "pending":
        raise HTTPException(
            status_code=400, detail=f"Receipt already {receipt.status}.")

    from backend.services import transaction_service as ts
    from decimal import Decimal as D
    from datetime import timezone as tz

    loan = db.query(models.Loan).filter(
        models.Loan.id == receipt.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    # Fetch producer — needed for return payload
    user = db.query(models.User).filter(
        models.User.id == loan.owner_id).first()

    try:
        ts.process_repayment(db, receipt.loan_id, D(
            str(receipt.amount)), loan.owner_id)
        receipt.status = "confirmed"
        receipt.confirmed_at = datetime.now(tz.utc)

        # Return money to treasury
        vault = db.query(models.Treasury).first()
        if vault:
            vault.available_balance = (
                vault.available_balance or 0) + receipt.amount

        create_user_notification(
            db, loan.owner_id,
            "Repayment Confirmed ✅",
            f"Your payment of ₱{float(receipt.amount):,.2f} for '{loan.project_title}' has been confirmed. Thank you!"
        )

        # Alert all admins in the notification panel
        create_admin_alert(db, "✅ Repayment Confirmed",
                           f"₱{float(receipt.amount):,.2f} repayment for '{loan.project_title}' confirmed. Ref: {receipt.reference_number}")
        log_action(db, admin.id, "CONFIRM_REPAYMENT", request.client.host,
                   target_id=loan.id, details={"amount": float(receipt.amount), "ref": receipt.reference_number})
        db.commit()
        return {
            "message": "Repayment confirmed and loan balance updated.",
            "producer_name": user.name if user else "Unknown",
            "amount": float(receipt.amount),
            "project_title": loan.project_title,
            "reference": receipt.reference_number
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Confirmation failed: {str(e)}")


@router.post("/repayment-receipts/{receipt_id}/reject")
def reject_repayment_receipt(
    receipt_id: int,
    reason: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    receipt = db.query(models.RepaymentReceipt).filter(
        models.RepaymentReceipt.id == receipt_id
    ).first()
    if not receipt or receipt.status != "pending":
        raise HTTPException(
            status_code=400, detail="Receipt not found or already processed.")

    receipt.status = "rejected"
    loan = db.query(models.Loan).filter(
        models.Loan.id == receipt.loan_id).first()
    if loan:
        create_user_notification(
            db, loan.owner_id, "Repayment Receipt Issue",
            f"Your receipt for '{loan.project_title}' was rejected. Reason: {reason}. Please resubmit with correct proof."
        )
    log_action(db, admin.id, "REJECT_REPAYMENT", request.client.host,
               target_id=receipt.loan_id, details={"reason": reason, "ref": receipt.reference_number})
    db.commit()
    return {"message": "Receipt rejected. Producer notified."}


# ── 3-GIVE TRANCHE RELEASE ────────────────────────────────────────────────────

@router.post("/loans/{loan_id}/release-tranche")
def release_next_tranche(
    loan_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Release the next tranche for a 3-give pre-production loan."""
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    three_give_total = getattr(loan, 'three_give_total', 0) or 0
    three_give_released = getattr(loan, 'three_give_released', 0) or 0

    if three_give_total == 0:
        raise HTTPException(status_code=400, detail="Not a 3-give loan.")
    if three_give_released >= three_give_total:
        raise HTTPException(
            status_code=400, detail="All tranches already released.")

    tranche_amount = float(loan.amount) / three_give_total
    vault = db.query(models.Treasury).with_for_update().first()
    if not vault or float(vault.available_balance) < tranche_amount:
        raise HTTPException(
            status_code=400, detail="Insufficient treasury funds for tranche.")

    vault.available_balance = float(vault.available_balance) - tranche_amount
    loan.three_give_released = three_give_released + 1

    import uuid as _uuid
    ref = f"TRANCHE-{_uuid.uuid4().hex[:8].upper()}"
    create_user_notification(
        db, loan.owner_id,
        f"Tranche {loan.three_give_released}/{three_give_total} Released 💰",
        f"₱{tranche_amount:,.2f} for '{loan.project_title}' has been sent. Ref: {ref}. Keep updating us on production!"
    )

    log_action(db, admin.id, "RELEASE_TRANCHE", request.client.host, target_id=loan_id,
               details={"tranche": loan.three_give_released, "amount": tranche_amount})
    db.commit()
    return {"message": f"Tranche {loan.three_give_released}/{three_give_total} released.", "ref": ref, "amount": tranche_amount}


# ── ADMIN NOTIFICATIONS ENDPOINT ─────────────────────────────────────────────

@router.get("/notifications")
def get_admin_notifications(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Returns notifications for the admin (security flags, repayment confirmations, etc.)"""
    notifs = db.query(models.Notification).filter(
        models.Notification.user_id == admin.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@router.post("/notifications/{notif_id}/read")
def mark_admin_notification_read(
    notif_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    n = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == admin.id
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_admin_notifications_read(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == admin.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


# ── CONTACT MESSAGES (admin inbox) ──
@router.get("/contact-messages")
def get_contact_messages(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Returns all user-to-admin contact messages stored in the DB."""
    try:
        msgs = db.query(models.ContactMessage).order_by(
            models.ContactMessage.sent_at.desc()
        ).limit(100).all()
        return [
            {
                "id": m.id,
                "from_name": m.from_name,
                "from_email": m.from_email,
                "subject": m.subject,
                "message": m.message,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
                "user_id": m.user_id,
            }
            for m in msgs
        ]
    except Exception:
        return []  # Table may not exist yet


@router.delete("/contact-messages/{message_id}")
def delete_contact_message(
    message_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Delete a contact message by ID."""
    msg = db.query(models.ContactMessage).filter(
        models.ContactMessage.id == message_id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    db.delete(msg)
    db.commit()
    return {"message": "Deleted."}


@router.post("/contact-messages/{message_id}/reply")
def reply_to_contact_message(
    message_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Admin replies to a user contact message by sending them a direct message."""
    msg = db.query(models.ContactMessage).filter(
        models.ContactMessage.id == message_id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    reply_body = payload.get("message", "").strip()
    if not reply_body:
        raise HTTPException(
            status_code=400, detail="Reply message cannot be empty.")
    # Find the user to send them a notification
    user = None
    if msg.user_id:
        user = db.query(models.User).filter(
            models.User.id == msg.user_id).first()
    if not user and msg.from_email:
        user = db.query(models.User).filter(
            models.User.email == msg.from_email).first()
    # Store as a system notification to the user
    if user:
        notif = models.Notification(
            user_id=user.id,
            title="Reply from Filmnance Admin",
            message=f"Re: {msg.subject}\n\n{reply_body}",
            type="admin_reply",
            is_read=False
        )
        db.add(notif)
        db.commit()
    return {"message": "Reply sent successfully."}


# ── HELPER: alert all admins when a new loan is submitted ────────────────────


def notify_admins_new_loan(db, loan):
    """Called from loan.py after a new application is saved."""
    try:
        create_admin_alert(
            db,
            "💰 New Loan Application",
            f"Producer '{loan.owner.name if hasattr(loan, 'owner') and loan.owner else '—'}' "
            f"submitted a new loan request for ₱{float(loan.amount):,.2f} — "
            f"Project: '{loan.project_title}'."
        )
    except Exception:
        pass


# ── FIX EXISTING LOAN SCHEDULES ──────────────────────────────────────────────
# Repairs all disbursed loans to use correct due dates based on production phase:
# Normal (Production/Post-Production/Distribution & Marketing): applied + 1 month
# Grace (Development/Pre-Production): applied + 3 months with monthly update rows

@router.post("/loans/repair-schedules")
def repair_loan_schedules(
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    """Recalculates and replaces loan schedules for all disbursed loans
    based on the correct production phase rules."""
    import re as _re
    import calendar as _cal

    def _add_months(dt, months):
        month = dt.month - 1 + months
        year = dt.year + month // 12
        month = month % 12 + 1
        day = min(dt.day, _cal.monthrange(year, month)[1])
        return dt.replace(year=year, month=month, day=day)

    GRACE_LABELS = {'pre-production', 'development'}
    NORMAL_LABELS = {'production', 'post-production', 'post production',
                     'distribution & marketing', 'distribution and marketing'}

    loans = db.query(models.Loan).filter(
        models.Loan.status == "disbursed"
    ).all()

    repaired = 0
    errors = []

    for loan in loans:
        try:
            # Determine phase from project_description
            desc = (loan.project_description or '')
            pm = _re.search(r'Phase:\s*([^|]+)', desc, _re.IGNORECASE)
            display_phase = pm.group(1).strip().lower() if pm else ''
            if not display_phase:
                stage = (loan.current_stage or '').lower()
                _map = {'pre_production': 'pre-production', 'development': 'development',
                        'production': 'production', 'post_production': 'post-production',
                        'distribution': 'distribution & marketing'}
                display_phase = _map.get(stage, stage.replace('_', '-'))

            grace_phase = display_phase in GRACE_LABELS

            # Get the disbursement/applied date from the earliest schedule entry
            first_sched = db.query(models.LoanSchedule).filter(
                models.LoanSchedule.loan_id == loan.id
            ).order_by(models.LoanSchedule.installment_number).first()

            if not first_sched:
                continue

            # Determine the loan's "applied" time: work backward from first due date
            # For normal loans: first_due = applied + 1 month → applied = first_due - 1 month
            # For grace loans: first due was applied + 3 months → applied = first_due - 3 months
            # Instead, use created_at as the base if available
            base_dt = loan.created_at or first_sched.due_date
            if base_dt.tzinfo is None:
                from datetime import timezone as _tz
                base_dt = base_dt.replace(tzinfo=_tz.utc)

            # Delete existing schedule
            db.query(models.LoanSchedule).filter(
                models.LoanSchedule.loan_id == loan.id
            ).delete(synchronize_session=False)

            # Regenerate using corrected schedule logic
            if grace_phase:
                loan.grace_months_granted = 3
                loan.grace_months_remaining = 3
                # Grace months 1-3: monthly update rows (base_dt +1, +2, +3)
                for grace_i in range(1, 4):
                    grace_due = _add_months(base_dt, grace_i)
                    db.add(models.LoanSchedule(
                        loan_id=loan.id,
                        installment_number=grace_i,
                        due_date=grace_due,
                        amount_due=loan.monthly_payment,
                        status="grace_update"
                    ))
                # Repayment: installment #1 = base_dt + 4 months, #2 = +5, etc.
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
                loan.grace_months_granted = 0
                loan.grace_months_remaining = 0
                # Normal: installment #1 = base_dt + 1 month, #2 = +2, etc.
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

            repaired += 1
        except Exception as e:
            errors.append(f"Loan #{loan.id}: {str(e)}")

    db.commit()
    log_action(db, admin_id=admin.id, action="REPAIR_LOAN_SCHEDULES",
               ip=request.client.host,
               details={"repaired": repaired, "errors": errors})
    return {
        "message": f"Repaired {repaired} loan schedule(s).",
        "repaired": repaired,
        "errors": errors
    }