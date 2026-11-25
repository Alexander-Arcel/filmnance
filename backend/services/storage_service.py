import os
from uuid import uuid4
from pathlib import Path
from fastapi import UploadFile, HTTPException, status

# 1. SETUP DIRECTORIES
BASE_UPLOAD_DIR = Path("uploads")
ID_DIR = BASE_UPLOAD_DIR / "ids"
SCRIPT_DIR = BASE_UPLOAD_DIR / "scripts"
VIDEO_DIR = BASE_UPLOAD_DIR / "trailers"  # New directory for trailers

# Create folders if they don't exist
for folder in [ID_DIR, SCRIPT_DIR, VIDEO_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

# 2. DEFINE CONSTRAINTS
ALLOWED_EXTENSIONS = {
    "ids": {".jpg", ".jpeg", ".png", ".pdf"},
    "scripts": {".pdf", ".docx"},
    "trailers": {".mp4", ".mov", ".mkv"}  # Added video extensions
}

# Size limits
MAX_FILE_SIZE = 5 * 1024 * 1024       # 5MB for IDs and Scripts
MAX_VIDEO_SIZE = 50 * 1024 * 1024    # 50MB for Trailers


def save_file(file: UploadFile, category: str) -> str:
    """
    Saves uploaded files securely.
    category: 'ids', 'scripts', or 'trailers'
    """
    # 1. Validate Category
    if category not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid upload category")

    # 2. Security: Check Extension
    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS[category]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Extension {extension} not allowed for {category}"
        )

    # 3. Security: Check File Size (Dynamic limit based on category)
    limit = MAX_VIDEO_SIZE if category == "trailers" else MAX_FILE_SIZE

    if file.size > limit:
        limit_mb = limit / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max limit for {category} is {int(limit_mb)}MB."
        )

    # 4. Create Unique Name and Path
    # Determine which folder to use
    if category == "scripts":
        target_folder = SCRIPT_DIR
    elif category == "trailers":
        target_folder = VIDEO_DIR
    else:
        target_folder = ID_DIR

    unique_name = f"{uuid4()}{extension}"
    file_path = target_folder / unique_name

    # 5. Save to Disk safely
    try:
        with file_path.open("wb") as buffer:
            # chunked reading is better for memory, especially for 50MB videos
            while content := file.file.read(1024 * 1024):  # 1MB chunks
                buffer.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Internal server error saving file."
        )
    finally:
        file.file.close()

    # 6. Return as Posix path (forward slashes) for DB compatibility
    return file_path.as_posix()
