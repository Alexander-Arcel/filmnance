import os
import re
import random
import requests
import smtplib
from datetime import datetime, timedelta, timezone
from typing import Optional
from email.message import EmailMessage

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv
from backend.models import models
from pathlib import Path

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# --- Rate Limiting ---
limiter = Limiter(key_func=get_remote_address)

# --- 1. Hashing & Policy Logic ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def validate_password_policy(password: str):
    """
    STRICT POLICY:
    - Min 8 characters, 1 Uppercase, 1 Number, 1 Special character
    """
    if len(password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=400, detail="Password must contain an uppercase letter.")
    if not re.search(r"\d", password):
        raise HTTPException(
            status_code=400, detail="Password must contain at least one number.")
    if not re.search(r"[ !@#$%^&*(),.?\":{}|<>]", password):
        raise HTTPException(
            status_code=400, detail="Password must contain a special character.")
    return True


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    if not hashed_password:
        return False
    return pwd_context.verify(plain_password, hashed_password)


# --- 2. JWT Token Logic ---
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set in the environment!")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(
        timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- 3. Authentication Dependencies ---


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        purpose: str = payload.get("purpose")

        # If the token has a "purpose" (like unfreeze), it's NOT a login token
        if purpose or email is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception

    # NOTE: Freeze check is handled at login time (router.py).
    # We allow frozen users to reach the dashboard so they can see the freeze notice.
    # Sensitive actions (PIN, payments) are still protected by verify_transaction_auth.
    return user


def get_current_admin(current_user: models.User = Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin privileges required.")
    return current_user

# --- 4. SENSITIVE ACTION CHECK (PIN Layer + 3-Strikes Lockout) ---


def verify_transaction_auth(pin: str, current_user: models.User, db: Session):
    """
    Checks the 6-digit transaction PIN with trust-based strictness.
    Uses flush() not commit() — caller is responsible for the final commit.
    Tier 0/1: 3 attempts max | Tier 2+: 5 attempts max

    Raises:
      428  — user never completed setup-security (no PIN set in DB)
      403  — PIN is locked due to too many failures
      401  — wrong PIN, shows remaining attempts
    """
    # 1. Check Lockout Status
    if current_user.pin_locked_until:
        now = datetime.now(timezone.utc)
        locked_until = current_user.pin_locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
            time_left = (locked_until - now).total_seconds() // 60
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"PIN locked. Try again in {int(max(1, time_left))} minutes."
            )
        else:
            current_user.failed_pin_attempts = 0
            current_user.pin_locked_until = None
            db.flush()

    # 2. Guard: PIN was never set — user skipped /auth/setup-security
    if not current_user.transaction_pin:
        raise HTTPException(
            status_code=428,  # Precondition Required
            detail="SECURITY_SETUP_REQUIRED"
        )

    # 3. Dynamic Max Attempts — more lenient to reduce false lockouts
    max_attempts = 5 if current_user.trust_tier >= 2 else 3

    # 4. Verify PIN
    if not verify_password(pin, current_user.transaction_pin):
        current_user.failed_pin_attempts = (
            current_user.failed_pin_attempts or 0) + 1
        db.flush()

        if current_user.failed_pin_attempts >= max_attempts:
            current_user.pin_locked_until = datetime.now(
                timezone.utc) + timedelta(minutes=30)
            db.flush()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Too many failed attempts. PIN locked for 30 minutes."
            )

        attempts_left = max_attempts - current_user.failed_pin_attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect PIN. {attempts_left} attempt(s) remaining."
        )

    # 5. Success: reset counters
    current_user.failed_pin_attempts = 0
    current_user.pin_locked_until = None
    db.flush()
    return True

# --- 5. SECURITY NOTIFICATIONS & OTP HELPERS ---


def generate_reset_code():
    """Generates a 6-digit code for password resets."""
    return str(random.randint(100000, 999999))


def generate_security_code():
    """Generates a 6-digit code for general verification."""
    return generate_reset_code()


def send_gmail_otp(receiver_email: str, code: str, reason: str = "Verification"):
    sender = os.getenv("EMAIL_USER")
    password = os.getenv("EMAIL_PASS")
    real_email = (os.getenv("REAL_EMAIL") or os.getenv("EMAIL_USER") or "")

    if not sender or not password:
        print(f"⚠️  [NO EMAIL CREDS] Set EMAIL_USER / EMAIL_PASS in .env")
        print(f"   Would send OTP [{code}] to: {receiver_email}")
        return True

    real_base = real_email.split("@")[0]
    to_address = receiver_email if real_base in receiver_email else real_email

    msg = EmailMessage()
    email_body = f"""FILMNANCE SECURITY CODE

Your verification code is:

    {code}

This code expires in 60 minutes.
If you did not request this, please secure your account immediately.

— Filmnance Security
"""
    msg.set_content(email_body)
    msg["Subject"] = f"[{code}] Your Filmnance Security Code"
    msg["From"] = f"Filmnance Security <{sender}>"
    msg["To"] = to_address

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, password)
            server.send_message(msg)
        print(f"✅ OTP sent to {to_address}")
        return True
    except Exception as e:
        print(f"❌ SMTP Error: {e}")
        return False

# --- 6. MAGIC LINK FOR UNFREEZING ---


def create_unfreeze_token(email: str):
    """Generates a 15-minute secure token to unfreeze an account via email.
    Embeds a unique jti for one-time-use enforcement.
    Returns (token, jti) tuple so the caller can store the jti on the user record."""
    import uuid
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    jti = str(uuid.uuid4())
    to_encode = {"sub": email, "exp": expire,
                 "purpose": "unfreeze", "jti": jti}
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token, jti


def send_security_alert_with_link(receiver_email: str, token: str, reason: str = "Security Alert"):
    sender = os.getenv("EMAIL_USER")
    password = os.getenv("EMAIL_PASS")
    base_url = os.getenv("APP_URL", "http://localhost:8000")

    unfreeze_url = f"{base_url}/api/v1/auth/unfreeze?token={token}"
    secure_url = f"{base_url}/api/v1/auth/no-unfreeze?token={token}"

    if not sender or not password:
        print(f"⚠️  [NO EMAIL CREDS] Set EMAIL_USER / EMAIL_PASS in .env")
        print(f"   Freeze alert for: {receiver_email}")
        print(f"   Unfreeze URL: {unfreeze_url}")
        return True

    real_email = (os.getenv("REAL_EMAIL") or os.getenv("EMAIL_USER") or "")
    real_base = real_email.split("@")[0]
    to_address = receiver_email if real_base in receiver_email else real_email

    msg = EmailMessage()
    msg["Subject"] = "🚨 Security Alert: Account Temporarily Frozen"
    msg["From"] = f"Filmnance Security <{sender}>"
    msg["To"] = to_address

    html_content = f"""
    <html>
        <body style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                            <tr>
                                <td style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">FILMNANCE</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 40px; text-align: left;">
                                    <h2 style="color: #d93025; margin-top: 0;">Suspicious Login Detected</h2>
                                    <p style="font-size: 16px; color: #555;">Hi there,</p>
                                    <p style="font-size: 16px; color: #555; line-height: 1.5;">
                                        We noticed a login attempt for <b>{receiver_email}</b> from an unrecognized IP address or location.
                                        For your protection, your account has been <b>temporarily frozen</b> to prevent unauthorized transactions.
                                    </p>
                                    <div style="margin: 35px 0; text-align: center;">
                                        <p style="font-weight: bold; margin-bottom: 20px; color: #333;">WAS THIS YOU?</p>
                                        <a href="{unfreeze_url}"
                                           style="display: inline-block; background-color: #28a745; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin-right: 10px;">
                                           YES, IT WAS ME
                                        </a>
                                        <a href="{secure_url}"
                                           style="display: inline-block; background-color: #d93025; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                                           NO, SECURE ACCOUNT
                                        </a>
                                    </div>
                                    <p style="font-size: 14px; color: #888; border-top: 1px solid #eee; padding-top: 20px;">
                                        <b>Important:</b> If you click "NO", your account remains frozen. You must reset your password to regain access securely.
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #aaa;">
                                    © 2026 Filmnance Security Systems. All rights reserved.
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>
    """

    msg.add_alternative(html_content, subtype='html')

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, password)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"❌ Design Alert Error: {e}")
        return False

# --- 7. GEOLOCATION UTILITIES ---


def get_ip_info(ip_address: str):
    """Fetches location data for an IP address using ip-api."""
    if ip_address in ["127.0.0.1", "localhost", "testclient", None]:
        return {"city": "Local", "country": "Local"}

    try:
        response = requests.get(
            f"http://ip-api.com/json/{ip_address}", timeout=3)
        data = response.json()

        if data.get('status') == 'fail':
            return {"city": "Unknown", "country": "Unknown"}

        return {
            "city": data.get("city"),
            "country": data.get("country")
        }
    except Exception as e:
        print(f"🌍 Geo-IP Error: {e}")
        return {"city": "Unknown", "country": "Unknown"}
