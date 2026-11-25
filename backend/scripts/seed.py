from backend.core.security import hash_password, pwd_context
from backend.models import models
from backend.core.database import SessionLocal, engine
import sys
import os
import socket
import requests as http_requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

# --- 🛠️ PATH FIX ---
sys.path.append(os.path.abspath(
    os.path.join(os.path.dirname(__file__), '../..')))


def get_machine_ip() -> str:
    """
    Detects the real IP address of the machine running the seed.
    Tries public IP first (what the server sees), falls back to local.
    """
    # Try to get public IP from an external service
    for service in [
        "https://api.ipify.org",
        "https://icanhazip.com",
        "https://ifconfig.me/ip",
    ]:
        try:
            resp = http_requests.get(service, timeout=3)
            ip = resp.text.strip()
            if ip and len(ip) < 50:  # sanity check
                return ip
        except Exception:
            continue

    # Fall back to local network IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"


def seed_database():
    db = SessionLocal()

    # --- Detect machine IP before seeding ---
    print("🌐 Detecting your machine IP address...")
    machine_ip = get_machine_ip()
    print(f"   Detected IP: {machine_ip}")
    print("   This will be stored as registration_ip and last_login_ip for all seed users.")
    print("   The freeze system will use this as the 'trusted home IP' for each account.")
    print()

    print("--- 🗑️ Cleaning Database for Live Demo... ---")
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)

    # Build Gmail plus-alias: arcelalexander15+tag@gmail.com → lands in arcelalexander15@gmail.com
    # Tags use ONLY letters, numbers, underscores — NO @ or . in the tag part
    real_email = os.getenv("REAL_EMAIL", "arcelalexander15@gmail.com")
    _rbase, _rdomain = real_email.split("@", 1)

    def alias(tag: str) -> str:
        """Build a valid Gmail plus-alias. Tag must contain no @ or . """
        return f"{_rbase}+{tag}@{_rdomain}"

    users = [
        {
            "name": "System Admin",
            "login": "admin@gmail.com",
            "verify":     alias("admin_recovery@gmail.com"),
            "pass": "Admintest@123",
            "pin": "123456",
            # → arcelalexander15+admin_pin_recovery@gmail.com
            "pin_verify": alias("admin_pin_recovery@gmail.com"),
            "is_admin": True,
            "trust": 100,
            "phone": "+63 917 123 4567",
            "bio": "Filmnance System Administrator. Contact for loan inquiries, account support, and platform assistance.",
            "filmmaker_role": "Director",
        },
        {
            "name": "Xel",
            "login": "xel@gmail.com",
            # → arcelalexander15+xel_security@gmail.com
            "verify":     alias("xel_recovery@gmail.com"),
            "pass": "Xeltest@123",
            "pin": "111111",
            "pin_verify": alias("xel_pin_recovery@gmail.com"),
            "is_admin": False,
            "trust": 25
        },
        {
            "name": "Kuuki",
            "login": "kuuki@gmail.com",
            # → arcelalexander15+kuuki_security@gmail.com
            "verify":     alias("kuuki_recovery@gmail.com"),
            "pass": "Kuukitest@123",
            "pin": "222222",
            "pin_verify": alias("kuuki_pin_recovery@gmail.com"),
            "is_admin": False,
            "trust": 25
        },
        {
            "name": "Kream",
            "login": "kream@gmail.com",
            # → arcelalexander15+kream_security@gmail.com
            "verify":     alias("kream_recovery@gmail.com"),
            "pass": "Kreamtest@123",
            "pin": "333333",
            "pin_verify": alias("kream_pin_recovery@gmail.com"),
            "is_admin": False,
            "trust": 90
        }
    ]

    for u in users:
        user_obj = models.User(
            name=u["name"],
            email=u["login"],
            recovery_email=u["verify"],
            hashed_password=hash_password(u["pass"]),
            pin_recovery_email=u["pin_verify"],
            transaction_pin=pwd_context.hash(u["pin"]),
            is_admin=u["is_admin"],
            # Kream and Admin are pre-verified
            is_verified=True if u["trust"] > 80 else False,
            trust_score=u["trust"],
            account_status="active",
            # Use detected machine IP as the trusted home IP for all seed users
            registration_ip=machine_ip,
            last_login_ip=machine_ip
        )
        db.add(user_obj)

    try:
        db.commit()
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

    print("\n" + "═"*90)
    print("🚀 SEED COMPLETE")
    print("═"*90)
    print(f"{'NAME':<20} | {'LOGIN EMAIL':<22} | {'VERIFY EMAIL':<30} | REGISTERED IP")
    for u in users:
        print(
            f"{u['name']:<20} | {u['login']:<22} | {u['verify']:<30} | {machine_ip}")
    print("═"*90)
    print()
    print("⚠️  IMPORTANT: The freeze system compares login IP against registration_ip.")
    print(f"   All seed users have registration_ip = {machine_ip}")
    print(f"   If you manually change last_login_ip in the DB to a foreign IP,")
    print(
        f"   logging in from {machine_ip} will be recognized as the original device.")
    print("═"*90)


if __name__ == "__main__":
    seed_database()
