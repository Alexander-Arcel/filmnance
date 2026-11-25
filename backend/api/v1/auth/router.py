from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, EmailStr

from backend.core.database import get_db
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    limiter,
    get_current_user,
    send_gmail_otp,
    generate_reset_code,
    verify_transaction_auth,
    get_ip_info,
    create_unfreeze_token,
    send_security_alert_with_link,
    validate_password_policy,
)
from backend.models import models
from backend.models.schemas import user_schemas
from backend.services.trust_service import TrustService
from decimal import Decimal

router = APIRouter(prefix="/auth", tags=["Auth"])

# --- HELPER ---


def update_user_otp(user, db: Session):
    otp = generate_reset_code()
    user.otp_code = otp
    user.otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=60)
    db.commit()
    return otp

# --- 1. LOGIN ---


@router.post("/login", response_model=user_schemas.Token)
@limiter.limit("10/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. AUTHENTICATION
    user = db.query(models.User).filter(
        models.User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")

    # FROZEN: auto-send unfreeze email immediately — no manual resend needed
    if user.account_status == "freeze":
        try:
            freeze_tkn, freeze_jti = create_unfreeze_token(user.email)
            if hasattr(user, 'last_unfreeze_token'):
                user.last_unfreeze_token = freeze_jti
            db.commit()
            send_security_alert_with_link(user.email, freeze_tkn)
        except Exception as e:
            print(f"[FREEZE EMAIL ERROR] {e}")
        raise HTTPException(
            status_code=403, detail="ACCOUNT_FREEZE_NEW_COUNTRY")

    if user.account_status != "active":
        raise HTTPException(
            status_code=403, detail=f"Access denied. Account is {user.account_status}.")

    # 2. APPLY TIME-BASED TRUST DECAY
    TrustService.apply_time_decay(db, user)

    # 3. GEOLOCATION SECURITY
    current_ip = request.client.host

    # Admin accounts and local/loopback IPs skip the geo-freeze check entirely.
    # Loopback IPs (127.x, ::1) can never be geo-located, so running ip-api
    # calls against them blocks the worker for no reason.
    _LOCAL_IPS = {"127.0.0.1", "::1", "localhost", "testclient"}
    _is_local_ip = current_ip in _LOCAL_IPS or current_ip.startswith("127.")
    _skip_geo = user.is_admin or _is_local_ip

    def is_real_country(c):
        return c not in (None, "Local", "Unknown")

    if not _skip_geo:
        if user.registration_ip and current_ip == user.registration_ip:
            pass

        elif user.last_login_ip and user.last_login_ip != current_ip:
            current_info = get_ip_info(current_ip)
            last_info = get_ip_info(user.last_login_ip)

            current_country = current_info.get('country')
            last_country = last_info.get('country')
            current_city = current_info.get('city')
            last_city = last_info.get('city')

            reg_info = get_ip_info(
                user.registration_ip) if user.registration_ip else {}
            reg_country = reg_info.get('country')
            reg_city = reg_info.get('city')

            def is_real(v):
                return v not in (None, "Local", "Unknown")

            city_differs_from_last = (
                is_real(current_city) and is_real(last_city) and
                current_city != last_city
            )
            city_differs_from_registration = (
                not is_real(reg_city) or current_city != reg_city
            )

            country_differs_from_last = (
                is_real_country(current_country) and is_real_country(last_country) and
                current_country != last_country
            )
            country_differs_from_registration = (
                not is_real_country(reg_country) or current_country != reg_country
            )

            should_freeze = (
                (city_differs_from_last and city_differs_from_registration) or
                (country_differs_from_last and country_differs_from_registration)
            )

            if should_freeze:
                user.account_status = "freeze"
                user.unfreeze_resend_count = 0
                user.unfreeze_last_resend_at = None
                db.commit()
                token, jti = create_unfreeze_token(user.email)
                if hasattr(user, 'last_unfreeze_token'):
                    user.last_unfreeze_token = jti
                db.commit()
                send_security_alert_with_link(user.email, token)
                raise HTTPException(
                    status_code=403, detail="ACCOUNT_FREEZE_NEW_COUNTRY")

    # 4. UPDATE USER METADATA
    user.last_login_ip = current_ip
    user.last_login_at = datetime.now(timezone.utc)

    for field in ("recovery_email", "pin_recovery_email"):
        val = getattr(user, field, None)
        if val and val.count("@") > 1:
            last_at = val.rfind("@")
            cleaned = val[:last_at]
            setattr(user, field, cleaned)

    db.commit()

    return {
        "access_token": create_access_token(data={"sub": user.email}),
        "token_type": "bearer",
        "name": user.name,
        "is_admin": user.is_admin,
        "trust_score": user.trust_score,
        "user_info": None
    }

# --- 2. FORGOT PASSWORD ---


@router.post("/forgot-password")
def request_password_otp(data: user_schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    import os
    from sqlalchemy import func

    lookup = data.recovery_email.strip().lower()

    user = db.query(models.User).filter(
        func.lower(func.trim(models.User.recovery_email)) == lookup
    ).first()

    if not user and "+" not in lookup:
        real_email = (os.getenv("REAL_EMAIL") or os.getenv("EMAIL_USER") or "")
        rbase, rdomain = real_email.split("@", 1)
        tag_clean = lookup.split("@")[0].strip()
        tag_full = lookup

        clean_alias = f"{rbase}+{tag_clean}@{rdomain}"
        broken_alias = f"{rbase}+{tag_full}@{rdomain}"

        user = db.query(models.User).filter(
            func.lower(func.trim(models.User.recovery_email)).in_(
                [clean_alias.lower(), broken_alias.lower()]
            )
        ).first()

    if user:
        otp = update_user_otp(user, db)
        real_email = (os.getenv("REAL_EMAIL") or os.getenv("EMAIL_USER") or "")
        send_gmail_otp(real_email, otp, reason="Password Reset")
        return {"message": "OTP sent to your recovery email.", "sent": True}
    return {"message": "No account found with that recovery email.", "sent": False}

# --- 3. RESET PASSWORD ---


@router.post("/reset-password-confirm")
def reset_password_confirm(data: user_schemas.ResetPasswordConfirm, db: Session = Depends(get_db)):
    import os
    from sqlalchemy import func

    lookup = data.email.strip().lower()

    user = db.query(models.User).filter(
        func.lower(func.trim(models.User.recovery_email)) == lookup
    ).first()

    if not user and "+" not in lookup:
        real_email = (os.getenv("REAL_EMAIL") or os.getenv("EMAIL_USER") or "")
        rbase, rdomain = real_email.split("@", 1)
        tag_clean = lookup.split("@")[0].strip()
        tag_full = lookup
        clean_alias = f"{rbase}+{tag_clean}@{rdomain}"
        broken_alias = f"{rbase}+{tag_full}@{rdomain}"
        user = db.query(models.User).filter(
            func.lower(func.trim(models.User.recovery_email)).in_(
                [clean_alias.lower(), broken_alias.lower()]
            )
        ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.otp_code != data.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    if user.otp_expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP code has expired")

    user.hashed_password = hash_password(data.new_password)
    user.otp_code = None
    user.otp_expiry = None
    db.commit()

    return {"message": "Password reset successfully. You can now log in."}

# --- 4. SIGNUP ---


@router.post("/signup", status_code=201)
def signup(request: Request, user_in: user_schemas.UserCreate, db: Session = Depends(get_db)):
    validate_password_policy(user_in.password)

    if db.query(models.User).filter(models.User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = models.User(
        name=user_in.name,
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        registration_ip=request.client.host,
        last_login_ip=request.client.host,
        last_login_at=datetime.now(timezone.utc),
        trust_score=25,
        behavior_trust=25,
        account_status="active"
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token(data={"sub": new_user.email})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": new_user
    }

# --- 5. INITIAL SECURITY SETUP ---


@router.post("/setup-security")
def setup_security(
    setup: user_schemas.SecuritySetup,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    current_user.recovery_email = setup.recovery_email
    current_user.pin_recovery_email = setup.pin_recovery_email
    current_user.transaction_pin = hash_password(setup.transaction_pin)
    # Security setup does NOT award trust points — only profile completion does

    try:
        db.commit()
        db.refresh(current_user)

        return {
            "status": "success",
            "message": "Security profile saved successfully.",
            "user": {
                "name": current_user.name,
                "email": current_user.email,
                "recovery_email": current_user.recovery_email
            }
        }
    except Exception as e:
        db.rollback()
        print(f"SETUP-SECURITY-ERROR: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save security profile. Ensure emails are unique."
        )

# --- 6. GET CURRENT USER ---


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    # Fix broken double-domain recovery emails
    for field in ("recovery_email", "pin_recovery_email"):
        val = getattr(current_user, field, None)
        if val and val.count("@") > 1:
            last_at = val.rfind("@")
            second_last_at = val.rfind("@", 0, last_at)
            if second_last_at != -1:
                setattr(current_user, field, val[:last_at])

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "is_verified": current_user.is_verified,
        "trust_score": current_user.trust_score,
        "account_status": current_user.account_status,
        "verification_status": current_user.verification_status,
        "filmmaker_role": current_user.filmmaker_role,
        "bio": current_user.bio,
        "portfolio_url": current_user.portfolio_url,
        "past_project_url": current_user.past_project_url,
        "past_project_urls": current_user.past_project_urls if isinstance(getattr(current_user, "past_project_urls", None), list) else [],
        "emergency_contact_name": current_user.emergency_contact_name,
        "emergency_contact_relationship": current_user.emergency_contact_relationship,
        "emergency_contact_phone": current_user.emergency_contact_phone,
        "emergency_contact_email": current_user.emergency_contact_email,
        "emergency_contact_id_url": current_user.emergency_contact_id_url,
        "id_type": current_user.id_type,
        "id_expiry_date": str(current_user.id_expiry_date.date()) if current_user.id_expiry_date else None,
        "id_photo_url": current_user.id_photo_url,
        "selfie_photo_url": current_user.selfie_photo_url,
        "recovery_email": current_user.recovery_email,
        "pin_recovery_email": current_user.pin_recovery_email,
        # "set" means PIN exists; None means setup-security was never completed
        "transaction_pin": "set" if current_user.transaction_pin else None,
        "approved_sections": current_user.approved_sections if isinstance(getattr(current_user, 'approved_sections', None), dict) else {},
        "rejected_sections": current_user.rejected_sections if isinstance(getattr(current_user, 'rejected_sections', None), dict) else {},
        "pending_changes": current_user.pending_changes if isinstance(getattr(current_user, 'pending_changes', None), dict) else {},
    }


# --- 7. UPDATE PROFILE & TRUST CALCULATION ---

@router.patch("/update-profile")
def update_profile(
    request: Request,
    user_update: user_schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. SECURITY GATE: Verify PIN

    # Pre-check: user never completed /auth/setup-security — PIN is NULL in DB.
    # Return 428 Precondition Required so the frontend can redirect to setup.
    if not current_user.transaction_pin:
        raise HTTPException(
            status_code=428,
            detail="SECURITY_SETUP_REQUIRED"
        )

    _pin = user_update.transaction_pin
    if _pin is None:
        raise HTTPException(
            status_code=400, detail="Transaction PIN is required.")
    _pin_str = _pin.get_secret_value() if hasattr(
        _pin, 'get_secret_value') else str(_pin)
    verify_transaction_auth(_pin_str, current_user, db)

    # 2. STATUS CHECK
    if current_user.account_status != "active":
        raise HTTPException(
            status_code=403,
            detail=f"Account is {current_user.account_status}. Profile updates are locked."
        )

    # 3. WHITELIST — only columns that actually exist on the User model
    ALLOWED_PROFILE_FIELDS = {
        "filmmaker_role", "bio", "portfolio_url",
        "past_project_url", "past_project_urls",
        "emergency_contact_name", "emergency_contact_relationship",
        "emergency_contact_phone", "emergency_contact_email",
        "emergency_contact_id_url",
        "id_type", "id_expiry_date", "id_photo_url", "selfie_photo_url",
    }

    update_data = user_update.model_dump(exclude_unset=True)

    # Strip PIN — never write it through this endpoint
    update_data.pop("transaction_pin", None)
    # Strip kyc_phone_number — no such column exists
    update_data.pop("kyc_phone_number", None)
    # Strip any unknown/extra fields not in the whitelist
    update_data = {k: v for k, v in update_data.items()
                   if k in ALLOWED_PROFILE_FIELDS}

    # Section mapping helper
    def _get_section(field_name):
        if field_name in ("filmmaker_role", "bio", "portfolio_url"):
            return "professional"
        if field_name in ("past_project_url", "past_project_urls"):
            return "past_project"
        if field_name in ("emergency_contact_name", "emergency_contact_relationship"):
            return "ec_name"
        if field_name in ("emergency_contact_phone", "emergency_contact_email"):
            return "ec_contact"
        if field_name == "emergency_contact_id_url":
            return "ec_id"
        if field_name in ("id_type", "id_photo_url", "selfie_photo_url", "id_expiry_date"):
            return "kyc"
        return None

    # 4. Build pending_changes:
    #    Always assign a NEW dict object so SQLAlchemy detects the change.
    #    Mutating the existing dict in-place (.update()) is silently ignored
    #    because SQLAlchemy JSON columns only track object identity changes.
    existing_pending = dict(current_user.pending_changes or {})
    approved_secs = dict(current_user.approved_sections or {})

    truly_new = {}
    for k, v in update_data.items():
        sec = _get_section(k)
        # If section already permanently approved, only queue if value changed
        if sec and approved_secs.get(sec):
            stored_val = getattr(current_user, k, None)
            if str(v or '').strip() != str(stored_val or '').strip():
                truly_new[k] = v
        else:
            # Not yet approved — always queue the field so admin sees it
            if v is not None and str(v).strip():
                truly_new[k] = v

    # Now apply all field values to the user object
    for key, value in update_data.items():
        if key == "id_expiry_date":
            if value:
                try:
                    from datetime import date as _date
                    parsed = _date.fromisoformat(str(value))
                    from datetime import datetime as _dt
                    value = _dt(parsed.year, parsed.month, parsed.day, 0, 0, 0)
                except (ValueError, TypeError):
                    value = None
            else:
                value = None

        if value is not None and not isinstance(value, (str, int, float, bool, Decimal)):
            value = str(value)

        setattr(current_user, key, value)

    # Queue for admin review — always assign a NEW dict (never mutate in-place)
    was_rejected = current_user.verification_status == "rejected"

    if truly_new:
        merged = {**existing_pending, **truly_new}
        current_user.pending_changes = merged
        current_user.verification_status = "pending"
        # Clear rejected_sections for the sections being resubmitted
        existing_rejected = dict(current_user.rejected_sections or {})
        for k in truly_new.keys():
            sec = _get_section(k)
            if sec and sec in existing_rejected:
                del existing_rejected[sec]
        current_user.rejected_sections = dict(existing_rejected)
    elif was_rejected and update_data:
        requeue = dict(existing_pending)
        existing_rejected = dict(current_user.rejected_sections or {})
        for f in update_data.keys():
            sec = _get_section(f)
            if not sec or not approved_secs.get(sec):
                val = getattr(current_user, f, None)
                if val:
                    requeue[f] = val
                    if sec and sec in existing_rejected:
                        del existing_rejected[sec]
        if requeue:
            current_user.pending_changes = dict(requeue)
            current_user.verification_status = "pending"
            current_user.rejected_sections = dict(existing_rejected)
    # Nothing changed and not rejected → keep status as-is

    # DO NOT recalculate trust score on save — only admin approval/rejection changes trust.

    # 6. COMMIT & return a clean serializable dict
    try:
        db.commit()
        db.refresh(current_user)
        # Audit log: user requested verification review
        if current_user.verification_status == "pending":
            try:
                from backend.services.audit_service import log_action
                # Build sections list from pending_changes
                _pending_keys = set(current_user.pending_changes.keys(
                )) if current_user.pending_changes else set()
                _sec_labels = {
                    "filmmaker_role": "Professional Info", "bio": "Professional Info",
                    "portfolio_url": "Professional Info",
                    "past_project_url": "Past Project", "past_project_urls": "Past Project",
                    "emergency_contact_name": "EC Name & Relation",
                    "emergency_contact_relationship": "EC Name & Relation",
                    "emergency_contact_phone": "EC Phone & Email",
                    "emergency_contact_email": "EC Phone & Email",
                    "emergency_contact_id_url": "EC ID Photo",
                    "id_photo_url": "Identity Verification (KYC)",
                    "selfie_photo_url": "Identity Verification (KYC)",
                    "id_type": "Identity Verification (KYC)",
                    "id_expiry_date": "Identity Verification (KYC)"
                }
                _sections = list(dict.fromkeys(
                    [_sec_labels[k] for k in _pending_keys if k in _sec_labels]))
                _sections_str = ", ".join(
                    _sections) if _sections else "Profile sections"
                log_action(db, admin_id=current_user.id, action="PROFILE_REQUEST",
                           ip=request.client.host,
                           target_id=current_user.id,
                           details={
                               "sections": _sections_str,
                               "user": current_user.name or current_user.email
                           })
            except Exception:
                pass

        return {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "is_verified": current_user.is_verified,
            "is_admin": current_user.is_admin,
            "trust_score": current_user.trust_score,
            "verification_status": current_user.verification_status,
            "filmmaker_role": current_user.filmmaker_role,
            "bio": current_user.bio,
            "portfolio_url": current_user.portfolio_url,
            "past_project_url": current_user.past_project_url,
            "past_project_urls": current_user.past_project_urls if isinstance(getattr(current_user, "past_project_urls", None), list) else [],
            "emergency_contact_name": current_user.emergency_contact_name,
            "emergency_contact_relationship": current_user.emergency_contact_relationship,
            "emergency_contact_phone": current_user.emergency_contact_phone,
            "emergency_contact_email": current_user.emergency_contact_email,
            "emergency_contact_id_url": current_user.emergency_contact_id_url,
            "id_type": current_user.id_type,
            "id_expiry_date": str(current_user.id_expiry_date.date()) if current_user.id_expiry_date else None,
            "id_photo_url": current_user.id_photo_url,
            "selfie_photo_url": current_user.selfie_photo_url,
            "account_status": current_user.account_status,
            "recovery_email": current_user.recovery_email,
            "approved_sections": current_user.approved_sections if isinstance(getattr(current_user, 'approved_sections', None), dict) else {},
            "rejected_sections": current_user.rejected_sections if isinstance(getattr(current_user, 'rejected_sections', None), dict) else {},
            "pending_changes": current_user.pending_changes if isinstance(getattr(current_user, 'pending_changes', None), dict) else {},
        }
    except Exception as e:
        db.rollback()
        print(f"[UPDATE PROFILE ERROR] {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database sync failed: {str(e)}"
        )

# --- 8. SECURITY UPDATES: STAGE 1 (REQUEST) ---


@router.post("/update-security-request")
def request_security_update(
    data: user_schemas.SecurityUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if data.recovery_email:
        current_user.recovery_email = data.recovery_email
    if data.pin_recovery_email:
        current_user.pin_recovery_email = data.pin_recovery_email

    import os
    real_email = (os.getenv("REAL_EMAIL") or os.getenv("EMAIL_USER") or "")

    otp = update_user_otp(current_user, db)
    success = send_gmail_otp(
        real_email, otp, reason="Security Update Verification")

    if not success:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Failed to send verification email.")

    db.commit()
    return {"message": "Verification code sent to your recovery email."}


# --- 9. SECURITY UPDATES: STAGE 2 (CONFIRM) ---

@router.patch("/update-security-confirm")
def confirm_security_update(
    data: user_schemas.SecurityUpdateConfirm,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not current_user.otp_code or current_user.otp_code != data.otp_code:
        raise HTTPException(
            status_code=400, detail="Invalid verification code.")

    now = datetime.now(timezone.utc)
    expiry = current_user.otp_expiry
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if expiry < now:
        raise HTTPException(
            status_code=400, detail="Verification code expired.")

    if data.new_password:
        if not data.old_password or not verify_password(data.old_password, current_user.hashed_password):
            raise HTTPException(
                status_code=401, detail="Old password incorrect.")
        current_user.hashed_password = hash_password(data.new_password)

    if data.new_transaction_pin:
        if not data.current_transaction_pin:
            raise HTTPException(
                status_code=400, detail="Current PIN required to set new PIN.")
        verify_transaction_auth(data.current_transaction_pin, current_user, db)
        current_user.transaction_pin = hash_password(data.new_transaction_pin)

    current_user.otp_code = None
    db.commit()
    return {"message": "Security settings updated successfully."}


# --- 10. ONE-CLICK UNFREEZE ---


@router.get("/unfreeze")
def unfreeze_account(token: str, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    from backend.core.security import SECRET_KEY, ALGORITHM
    from fastapi.responses import RedirectResponse

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "unfreeze":
            return RedirectResponse(url="/?status=invalid_token", status_code=302)
        email = payload.get("sub")
        jti = payload.get("jti")
    except JWTError:
        return RedirectResponse(url="/?status=link_expired", status_code=302)

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return RedirectResponse(url="/?status=not_found", status_code=302)

    stored_jti = getattr(user, 'last_unfreeze_token', None)
    if jti and stored_jti is not None and stored_jti != jti:
        return RedirectResponse(url="/?status=link_expired", status_code=302)

    if hasattr(user, 'last_unfreeze_token'):
        user.last_unfreeze_token = None

    user.account_status = "active"
    user.failed_pin_attempts = 0
    user.last_login_ip = None
    user.registration_ip = None
    user.unfreeze_resend_count = 0
    user.unfreeze_last_resend_at = None
    db.commit()

    return RedirectResponse(url="/?status=unfrozen", status_code=302)


# --- 10b. NO BUTTON ---


@router.get("/no-unfreeze")
def no_unfreeze(token: str, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    from backend.core.security import SECRET_KEY, ALGORITHM
    from fastapi.responses import RedirectResponse

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "unfreeze":
            return RedirectResponse(url="/?status=invalid_token", status_code=302)
        email = payload.get("sub")
        jti = payload.get("jti")
    except JWTError:
        return RedirectResponse(url="/?action=secure", status_code=302)

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return RedirectResponse(url="/?action=secure", status_code=302)

    stored_jti = getattr(user, 'last_unfreeze_token', None)
    if jti and stored_jti is not None and stored_jti == jti:
        if hasattr(user, 'last_unfreeze_token'):
            user.last_unfreeze_token = None
        db.commit()

    return RedirectResponse(url="/?action=secure", status_code=302)


# --- 11. REQUEST UNFREEZE LINK ---

@router.post("/request-unfreeze")
def request_new_unfreeze_link(
    body: user_schemas.UnfreezeRequest,
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(
        models.User.email == body.email).first()

    generic_msg = {
        "message": "If this account is frozen, a fresh unfreeze link has been sent."}

    if not user or user.account_status != user_schemas.AccountStatus.FREEZE:
        return generic_msg

    MAX_RESENDS = 3
    count = user.unfreeze_resend_count or 0

    if count >= MAX_RESENDS:
        raise HTTPException(
            status_code=429,
            detail="MAX_RESEND_REACHED"
        )

    cooldown_map = {0: 0, 1: 15, 2: 30, 3: 60}
    required_cooldown = cooldown_map.get(count, 60)

    if required_cooldown > 0 and user.unfreeze_last_resend_at:
        now = datetime.now(timezone.utc)
        last = user.unfreeze_last_resend_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed_minutes = (now - last).total_seconds() / 60
        if elapsed_minutes < required_cooldown:
            remaining = int(required_cooldown - elapsed_minutes) + 1
            raise HTTPException(
                status_code=429,
                detail=f"COOLDOWN:{remaining}"
            )

    token, jti = create_unfreeze_token(user.email)
    if hasattr(user, 'last_unfreeze_token'):
        user.last_unfreeze_token = jti
    send_security_alert_with_link(
        user.email, token, "Account Recovery Request")

    user.unfreeze_resend_count = count + 1
    user.unfreeze_last_resend_at = datetime.now(timezone.utc)
    db.commit()

    return generic_msg


# --- 12. REQUEST PAYMENT DELAY (Producer) ---

@router.post("/loans/{loan_id}/schedule/{schedule_id}/request-delay")
def request_payment_delay(
    loan_id: int,
    schedule_id: int,
    reason: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    from backend.models import models as m

    loan = db.query(m.Loan).filter(
        m.Loan.id == loan_id,
        m.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    schedule = db.query(m.LoanSchedule).filter(
        m.LoanSchedule.id == schedule_id,
        m.LoanSchedule.loan_id == loan_id
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Installment not found.")
    if schedule.status == "paid":
        raise HTTPException(
            status_code=400, detail="Installment already paid.")

    existing = getattr(schedule, 'delay_status', None)
    if existing in ("pending", "approved"):
        raise HTTPException(
            status_code=400, detail="A delay request is already active for this installment.")

    schedule.delay_requested = True
    schedule.delay_reason = reason.strip() if reason else None
    schedule.delay_status = "pending"
    db.commit()

    return {"message": "Delay request submitted. You will be notified once the admin reviews it."}


# --- 13. VERIFY PIN ---

@router.post("/verify-pin")
def verify_pin(
    data: user_schemas.PinVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # If no PIN is set, user needs to complete setup-security first
    if not current_user.transaction_pin:
        raise HTTPException(
            status_code=428,
            detail="SECURITY_SETUP_REQUIRED"
        )
    pin_str = data.pin.get_secret_value() if hasattr(
        data.pin, 'get_secret_value') else str(data.pin)
    verify_transaction_auth(pin_str, current_user, db)
    return {"valid": True, "message": "PIN verified."}


# --- 14. LOGOUT ---

@router.post("/logout")
def logout():
    return {"message": "Successfully logged out."}


# --- 15. CONTACT ADMIN ---

class ContactAdminRequest(BaseModel):
    name: str
    from_email: str
    subject: str
    message: str


@router.get("/admin-contact-info")
def get_admin_contact_info(current_user: models.User = Depends(get_current_user)):
    import os
    display_email = os.getenv("ADMIN_DISPLAY_EMAIL", "admin@filmnance.com")
    return {"admin_email": display_email}


@router.post("/contact-admin")
def contact_admin(
    req: ContactAdminRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    import os
    import smtplib
    from email.message import EmailMessage as _EM

    email_user = os.getenv("EMAIL_USER", "")
    email_pass = os.getenv("EMAIL_PASS", "")
    real_email = os.getenv("REAL_EMAIL", email_user)

    if not email_user or not email_pass:
        raise HTTPException(
            status_code=503,
            detail="Email service not configured. Please contact support directly."
        )

    msg = _EM()
    msg["Subject"] = f"[Filmnance User Message] {req.subject}"
    msg["From"] = f"Filmnance Support <{email_user}>"
    msg["To"] = real_email
    msg["Reply-To"] = req.from_email

    body = (
        f"FROM: {req.name} <{req.from_email}>\n"
        f"USER ID: #{current_user.id} — {current_user.email}\n"
        f"{'='*50}\n\n"
        f"{req.message}\n\n"
        f"---\nSent via Filmnance Producer Portal contact form."
    )
    msg.set_content(body)

    # Always save to DB first (so admin inbox works even if email fails)
    try:
        from backend.models.models import ContactMessage
        db_msg = ContactMessage(
            user_id=current_user.id,
            from_name=req.name,
            from_email=req.from_email,
            subject=req.subject,
            message=req.message,
        )
        db.add(db_msg)
        db.commit()
    except Exception:
        pass

    # Then attempt email (non-fatal if it fails)
    if email_user and email_pass:
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as srv:
                srv.login(email_user, email_pass)
                srv.send_message(msg)
        except Exception:
            pass

    return {"message": "Your message was sent. We'll reply to your email soon."}