import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from typing import Set

from backend.core.database import get_db
from backend.core.security import get_current_user
from backend.models import models
from backend.services import storage_service
from backend.services.trust_service import TrustService

router = APIRouter(prefix="/uploads", tags=["Uploads"])

# --- Helper ---


def validate_file(file: UploadFile, allowed_types: Set[str], max_size_mb: int = 10):
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type: {file.content_type}. Allowed: {allowed_types}"
        )


def _ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def _save_bytes(content: bytes, folder: Path, ext: str) -> tuple[str, str]:
    """Save raw bytes to folder, return (unique_name, file_url)."""
    _ensure_dir(folder)
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = folder / unique_name
    with file_path.open("wb") as f:
        f.write(content)
    category = folder.name
    file_url = f"/uploads/{category}/{unique_name}"
    return unique_name, file_url

# --- 1. IDENTITY DOCUMENT (Front of ID) ---


@router.post("/identity-doc")
async def upload_identity_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    validate_file(file, {"image/jpeg", "image/png", "application/pdf"})

    file_path = storage_service.save_file(file, category="ids")

    try:
        filename = os.path.basename(file_path)
        file_url = f"/uploads/ids/{filename}"
        current_user.id_photo_url = file_url
        current_user.verification_status = "pending"
        TrustService.apply_profile_update_boost(db, current_user)

        new_doc = models.UserDocument(
            user_id=current_user.id,
            document_type="Identity Proof",
            file_path=file_path
        )
        db.add(new_doc)
        db.commit()
        db.refresh(current_user)

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record document and update trust score."
        )

    return {
        "message": "ID uploaded successfully. Trust score updated.",
        "id_photo_url": file_url,
        "new_tier": current_user.trust_tier
    }


# --- 1b. SELFIE DOCUMENT ---

@router.post("/selfie-doc")
async def upload_selfie_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    validate_file(file, {"image/jpeg", "image/png"})

    file_path = storage_service.save_file(file, category="ids")

    try:
        filename = os.path.basename(file_path)
        file_url = f"/uploads/ids/{filename}"
        current_user.selfie_photo_url = file_url
        current_user.verification_status = "pending"
        TrustService.apply_profile_update_boost(db, current_user)

        new_doc = models.UserDocument(
            user_id=current_user.id,
            document_type="Selfie with ID",
            file_path=file_path
        )
        db.add(new_doc)
        db.commit()
        db.refresh(current_user)

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record selfie and update trust score."
        )

    return {
        "message": "Selfie uploaded successfully.",
        "selfie_photo_url": file_url,
        "new_tier": current_user.trust_tier
    }

# --- 1c. EC ID DOCUMENT (Emergency Contact ID Photo) ---
# Separate from /identity-doc so it does NOT overwrite id_photo_url (KYC field)


@router.post("/ec-id-doc")
async def upload_ec_id_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    validate_file(file, {"image/jpeg", "image/png", "application/pdf"})
    file_path = storage_service.save_file(file, category="ids")
    try:
        filename = os.path.basename(file_path)
        file_url = f"/uploads/ids/{filename}"
        # Store in emergency_contact_id_url ONLY — never touch id_photo_url
        current_user.emergency_contact_id_url = file_url
        TrustService.apply_profile_update_boost(db, current_user)
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Failed to save EC ID photo.")
    return {
        "message": "EC ID uploaded successfully.",
        "ec_id_url": file_url,
    }


# --- 2. SCRIPT ---

@router.post("/film-script/{loan_id}")
async def upload_script(
    loan_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    validate_file(file, {"application/pdf"})

    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()

    if not loan:
        raise HTTPException(
            status_code=404, detail="Loan not found or unauthorized")

    file_path = storage_service.save_file(file, category="scripts")

    try:
        loan.script_url = file_path
        db.commit()
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Error updating script record")

    return {"message": "Script uploaded successfully", "file_path": file_path}


# --- 3. TRAILER ---

@router.post("/loan/{loan_id}/trailer")
async def upload_trailer(
    loan_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    validate_file(file, {"video/mp4", "video/quicktime", "video/x-msvideo"})

    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()

    if not loan:
        raise HTTPException(status_code=404, detail="Loan project not found")

    file_path = storage_service.save_file(file, category="trailers")

    try:
        loan.trailer_url = file_path
        db.commit()
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Error updating trailer record")

    return {"message": "Trailer uploaded successfully", "trailer_url": file_path}


# --- 4. PAST PROJECT ---

@router.post("/past-project")
async def upload_past_project(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Upload a past project file for the producer profile.
    Accepts: MP4, MOV, MKV, AVI (video), PDF, JPG, PNG, WEBP (image).
    """
    ALLOWED = {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/x-msvideo": ".avi",
        "video/x-matroska": ".mkv",
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }

    if file.content_type not in ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed: {file.content_type}. "
            f"Upload MP4, MOV, MKV, AVI, PDF, JPG, PNG, or WEBP."
        )

    is_video = file.content_type.startswith("video/")
    max_bytes = 200 * 1024 * 1024 if is_video else 20 * 1024 * 1024

    content = await file.read()
    if len(content) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {limit_mb}MB for this file type."
        )

    ext = ALLOWED[file.content_type]
    folder = Path("uploads") / ("trailers" if is_video else "ids")
    _, file_url = _save_bytes(content, folder, ext)

    try:
        current_user.past_project_url = file_url
        db.commit()
    except Exception:
        db.rollback()
        pass

    return {
        "message": "Past project uploaded successfully.",
        "url": file_url,
        "file_url": file_url,
    }


# --- 5. DELAY PROOF ---

@router.post("/delay-proof")
async def upload_delay_proof(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Upload proof for a payment delay request.
    Accepts: photo (JPG, PNG, WEBP), video (MP4, MOV), or PDF.
    """
    ALLOWED = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "application/pdf": ".pdf",
    }

    if file.content_type not in ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed: {file.content_type}. "
            f"Upload JPG, PNG, WEBP, MP4, MOV, or PDF."
        )

    is_video = file.content_type.startswith("video/")
    max_bytes = 200 * 1024 * 1024 if is_video else 20 * 1024 * 1024

    content = await file.read()
    if len(content) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {limit_mb}MB."
        )

    ext = ALLOWED[file.content_type]
    folder = Path("uploads") / "delay_proofs"
    _, file_url = _save_bytes(content, folder, ext)

    return {
        "message": "Proof uploaded successfully.",
        "url": file_url,
        "file_url": file_url,
    }


# --- 6. LOAN ASSET ---
# Fixed: now uses _save_bytes directly instead of storage_service.save_file
# (storage_service only knows 'ids', 'scripts', 'trailers' — 'lookbook' would 400).
# Lookbook limit raised to 100MB.

@router.post("/loan-asset")
async def upload_loan_asset(
    file: UploadFile = File(...),
    category: str = "scripts",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Upload a loan asset file (script, lookbook, or trailer) during application.
    category: 'scripts' | 'lookbooks' | 'trailers'
    Limits: trailers 200MB | lookbooks 100MB | scripts 20MB
    """
    ALLOWED_BY_CATEGORY = {
        "scripts": {
            "application/pdf": ".pdf",
            "application/msword": ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        },
        "lookbooks": {
            "application/pdf": ".pdf",
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "application/vnd.ms-powerpoint": ".ppt",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        },
        "trailers": {
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
            "video/x-msvideo": ".avi",
        },
    }

    if category not in ALLOWED_BY_CATEGORY:
        raise HTTPException(
            status_code=400, detail=f"Invalid category: {category}.")

    allowed = ALLOWED_BY_CATEGORY[category]
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not allowed for {category}."
        )

    if category == "trailers":
        max_bytes = 200 * 1024 * 1024  # 200MB
    elif category == "lookbooks":
        max_bytes = 100 * 1024 * 1024  # 100MB
    else:
        max_bytes = 20 * 1024 * 1024   # 20MB for scripts

    content = await file.read()
    if len(content) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {limit_mb}MB for {category}."
        )

    ext = allowed[file.content_type]
    folder = Path("uploads") / category
    _, file_url = _save_bytes(content, folder, ext)

    return {
        "message": f"{category.rstrip('s').capitalize()} uploaded successfully.",
        "url": file_url,
        "file_url": file_url,
    }
