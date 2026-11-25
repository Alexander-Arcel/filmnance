import os
from pathlib import Path

from dotenv import load_dotenv

# Load variables from the project-root .env file
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent / ".env")


class Settings:
    PROJECT_NAME: str = "Filmnance"

    # Database Configuration
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # Security Configuration
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 Day

    # Email Settings
    EMAIL_USER: str = os.getenv("EMAIL_USER", "")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS", "")

    # Business Logic / Risk Management
    MAX_LOAN_LIMIT: float = 2000000.00
    MIN_TRUST_SCORE_REQUIRED: int = 60
    MAX_ACTIVE_LOANS_PER_USER: int = 1


# Initialize the settings object
settings = Settings()
