import os
from dotenv import load_dotenv
from decimal import Decimal
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
import json

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.core.database import engine
from backend.models import models
from backend.api.v1.auth.router import router as auth_router
from backend.api.v1.transactions import router as transactions_router
from backend.api.v1.loan import router as loans_router
from backend.api.v1 import admin
from backend.core.security import limiter
from backend.api.v1.uploads import router as uploads_router
from backend.core.scheduler import start_scheduler, stop_scheduler

load_dotenv()

# --- STEP 1: DECIMAL HANDLER ---


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


class CustomJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            cls=CustomJSONEncoder,
        ).encode("utf-8")


# --- STEP 2: INITIALIZE APP & DATABASE ---
models.Base.metadata.create_all(bind=engine)

# Ensure directories exist
UPLOAD_PATHS = ["uploads/ids", "uploads/scripts",
                "uploads/trailers", "frontend"]
for path in UPLOAD_PATHS:
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)

app = FastAPI(
    title="Filmnance API",
    default_response_class=CustomJSONResponse
)

# --- STEP 3: SECURITY & MIDDLEWARE ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STEP 4: ROUTERS (API FIRST) ---
app.include_router(auth_router, prefix="/api/v1")
app.include_router(loans_router, prefix="/api/v1")
app.include_router(transactions_router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(uploads_router, prefix="/api/v1")


@app.on_event("startup")
def _on_startup():
    start_scheduler()


@app.on_event("shutdown")
def _on_shutdown():
    stop_scheduler()

# --- STEP 5: FILE SERVING & MOUNTS ---

# 1. Main Landing Page


@app.get("/")
async def read_index():
    # Serve the landing page from the frontend folder
    return FileResponse("frontend/index.html")

# 2. Friendly Dashboard URLs (Optional, matches your JS redirects)


@app.get("/admin-dashboard")
async def get_admin_dashboard():
    return FileResponse("frontend/admin/admin_dashboard.html")


@app.get("/user-dashboard")
async def read_user_dashboard():
    return FileResponse("frontend/user/user_dashboard.html")

# 3. Mount Static Files LAST
# This handles all CSS/JS calls like <script src="/static/app.js">
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# 4. Mount Uploads
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
