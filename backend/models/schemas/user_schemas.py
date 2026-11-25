from pydantic import BaseModel, Field, HttpUrl, EmailStr, field_validator, SecretStr
from typing import Optional
from datetime import date
import re
from datetime import datetime, date
from enum import Enum
from typing import List, Optional
from decimal import Decimal
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    computed_field,
    field_validator,
    model_validator
)
from backend.core.config import settings
from pydantic import BaseModel, ConfigDict, AliasGenerator, EmailStr
from pydantic.alias_generators import to_camel

# --- 0. ENUMS ---


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=AliasGenerator(
            serialization_alias=to_camel,
        ),
        populate_by_name=True,
        from_attributes=True
    )


class VerificationStatus(str, Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class AccountStatus(str, Enum):
    ACTIVE = "active"
    FREEZE = "freeze"
    BANNED = "banned"


class TransactionType(str, Enum):
    REPAYMENT = "repayment"
    PENALTY = "penalty_fee"
    DISBURSEMENT = "disbursement"


class ProductionStage(str, Enum):
    PRE_PRODUCTION = "pre_production"
    PRINCIPAL_PHOTOGRAPHY = "production"
    POST_PRODUCTION = "post_production"
    MARKETING_DISTRIBUTION = "distribution"


class LoanPurpose(str, Enum):
    EQUIPMENT = "Equipment Rental (Camera/Lights/Sound)"
    LOCATION = "Location Fees & Permits"
    CAST_SALARIES = "Cast Salaries"
    CREW_SALARIES = "Crew Salaries"
    SET_PROPS = "Set Design & Props"
    WARDROBE = "Wardrobe & Makeup"
    CATERING = "Catering & Food"
    TRANSPORT = "Transportation & Gas"
    POST_PRODUCTION = "Editing & Sound Mixing"
    MARKETING = "Ads & Festival Fees"
    OTHER = "Other (Specify in Description)"

# --- 1. SUB-SCHEMAS ---


class LoanPurposeSelection(BaseModel):
    requirements_list: List[LoanPurpose] = Field(
        ...,
        min_length=1,
        description="Select at least one category from the checkboxes"
    )
    purpose: Optional[str] = Field(None)


class FilmMetadata(BaseModel):
    genre: str = Field(..., examples=["Drama", "Horror", "Documentary"])
    shooting_location: str = Field(..., examples=["Quezon City", "Manila"])
    attached_talent: Optional[str] = Field(None)
    production_company: Optional[str] = None

# --- 2. AUTH & IDENTITY SCHEMAS ---


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str

    @model_validator(mode='after')
    def check_passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# --- 4. LOAN SCHEMAS ---


class LoanBase(BaseModel):
    project_title: str = Field(..., examples=["The Indie Masterpiece"])
    amount: Decimal = Field(gt=0, decimal_places=2)
    duration_months: int = Field(gt=0, le=60)
    purposes: List[LoanPurpose] = Field(..., min_length=1)
    current_stage: ProductionStage = Field(
        default=ProductionStage.PRE_PRODUCTION)
    film_details: FilmMetadata
    project_description: Optional[str] = Field(None)
    trailer_url: Optional[str] = None
    script_url: Optional[str] = None
    lookbook_url: Optional[str] = Field(None)


class LoanCreate(LoanBase):
    pass


class LoanResponse(BaseModel):
    id: int
    project_title: Optional[str] = None
    amount: Optional[Decimal] = None
    duration_months: Optional[int] = None
    remaining_amount: Decimal
    interest_rate: Decimal = Field(decimal_places=4)
    monthly_payment: Decimal
    status: str
    admin_notes: Optional[str] = None
    next_payment_due: Optional[datetime] = None
    is_overdue: bool
    total_penalty_paid: Decimal
    missed_payments_count: int
    created_at: datetime
    owner_id: int
    script_url: Optional[str] = None
    lookbook_url: Optional[str] = None
    trailer_url: Optional[str] = None
    project_description: Optional[str] = None

    @computed_field
    @property
    def can_repay(self) -> bool:
        return self.status == "disbursed" and self.remaining_amount > 0

    @computed_field
    @property
    def status_label(self) -> str:
        if self.is_overdue:
            return "OVERDUE"
        return self.status.upper()

    model_config = ConfigDict(from_attributes=True)

# --- 5. TRANSACTION & PAYMENT SCHEMAS ---


class TransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    loan_id: int
    transaction_type: TransactionType


class TransactionResponse(BaseModel):
    id: int
    amount: Decimal
    transaction_type: TransactionType
    created_at: datetime
    loan_id: int
    project_title: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# --- 6. CARD CREATE AND RESPONSE ---


class CardCreate(BaseModel):
    card_number: SecretStr = Field(..., examples=["4111222233334444"])

    @field_validator("card_number")
    @classmethod
    def validate_card_number(cls, v: SecretStr):
        card_str = v.get_secret_value()
        if len(card_str) < 13 or len(card_str) > 19:
            raise ValueError("Card number must be between 13 and 19 digits")
        return v

    card_type: str = Field(..., examples=["Debit"])
    expiry_date: str = Field(...,
                             pattern=r"^(0[1-9]|1[0-2])\/\d{2}$", examples=["12/28"])

    @field_validator("expiry_date")
    @classmethod
    def validate_expiry_date(cls, v: str):
        try:
            exp_date = datetime.strptime(v, "%m/%y")
            exp_year = exp_date.year + 2000 if exp_date.year < 100 else exp_date.year
            exp_month = exp_date.month
            now = datetime.now()
            if exp_year < now.year or (exp_year == now.year and exp_month < now.month):
                raise ValueError("Card has expired")
            return v
        except ValueError as e:
            if "expired" in str(e):
                raise e
            raise ValueError("Format must be MM/YY")


class CardResponse(BaseModel):
    id: int
    card_type: str
    last_four: str
    brand: str
    is_default: bool
    model_config = ConfigDict(from_attributes=True)

# --- 7. USERUPDATE SCHEMA ---
# ONLY fields that actually exist on the User model are included.
# kyc_phone_number is intentionally excluded — there is no such column.


class UserUpdate(BaseModel):
    # 1. SECURITY — used for PIN verification, stripped before DB write
    transaction_pin: Optional[SecretStr] = Field(
        None, description="6-digit security PIN")

    @field_validator("transaction_pin")
    @classmethod
    def validate_transaction_pin(cls, v: Optional[SecretStr]):
        if v is None:
            return v
        pin_str = v.get_secret_value()
        if len(pin_str) != 6 or not pin_str.isdigit():
            raise ValueError("Transaction PIN must be exactly 6 digits")
        return v

    # 2. FILMMAKER IDENTITY
    filmmaker_role: Optional[str] = Field(
        None, examples=["Director", "Producer"])
    bio: Optional[str] = Field(None, max_length=1000)
    portfolio_url: Optional[str] = Field(
        None, examples=["https://www.imdb.com/name/nm1234567"])
    past_project_url: Optional[str] = Field(
        None, examples=["https://vimeo.com/1234567"])

    # 3. EMERGENCY CONTACT
    emergency_contact_name: Optional[str] = Field(
        None, examples=["Juana Dela Cruz"])
    emergency_contact_relationship: Optional[str] = Field(
        None, examples=["Spouse"])
    emergency_contact_phone: Optional[str] = Field(
        None, examples=["09123456789"])
    emergency_contact_email: Optional[EmailStr] = Field(None)
    emergency_contact_id_url: Optional[str] = Field(None)

    # 4. PHILIPPINE KYC
    id_type: Optional[str] = Field(None, examples=["Passport"])
    id_expiry_date: Optional[str] = Field(
        None,
        description="Date as YYYY-MM-DD string. Stored as string, avoids date/DateTime type mismatch."
    )
    id_photo_url: Optional[str] = None
    selfie_photo_url: Optional[str] = None
    # kyc_phone_number: accepted from frontend but NOT written to DB
    # (there is no kyc_phone_number column — it's the emergency contact phone)
    kyc_phone_number: Optional[str] = Field(None, exclude=True)

    # --- Coerce empty strings to None BEFORE any validation ---
    @field_validator("id_type", "id_expiry_date", "portfolio_url", "past_project_url",
                     "emergency_contact_name", "emergency_contact_relationship",
                     "emergency_contact_phone", "id_photo_url", "selfie_photo_url",
                     "filmmaker_role", "bio", "emergency_contact_id_url",
                     mode="before")
    @classmethod
    def coerce_empty_string_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

    @field_validator("id_type")
    @classmethod
    def validate_known_ids(cls, v: Optional[str]):
        if not v:
            return v
        # Must exactly match the <option> values in the HTML dropdown
        allowed_ids = [
            "Philippine National ID (PhilID)", "ePhilID", "Passport", "Driver's License",
            "UMID", "SSS ID", "PRC ID", "Postal ID (Digital/Improved)", "Voter's ID",
            "PhilHealth ID", "TIN ID", "Pag-IBIG ID", "NBI Clearance",
        ]
        if v not in allowed_ids:
            raise ValueError(
                "ID Type not recognized. Please select a valid Philippine ID from the dropdown.")
        return v

    @field_validator("emergency_contact_phone")
    @classmethod
    def validate_and_normalize_ph_phone(cls, v: Optional[str]):
        if v:
            if not re.match(r"^(09|\+639)\d{9}$", v):
                raise ValueError(
                    "Invalid Philippine mobile number format (e.g., 09171234567)")
            if v.startswith("09"):
                return f"+63{v[1:]}"
        return v

    @field_validator("id_expiry_date")
    @classmethod
    def validate_id_not_expired(cls, v: Optional[str]):
        if not v:
            return v
        try:
            expiry = date.fromisoformat(v)
            if expiry < date.today():
                raise ValueError(
                    "ID expiry date is in the past. Please provide a currently valid ID.")
        except ValueError as e:
            # Only re-raise our own "expired" error — ignore bad date format strings
            # so that edge cases (e.g. "2028-1-1") don't crash the entire save
            if "expiry date is in the past" in str(e):
                raise
            # Malformed date string — pass through, DB will store NULL
        return v


# --- 8. USER RESPONSE ---


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    is_verified: bool
    trust_score: int
    is_admin: bool
    recovery_email: Optional[str] = None
    transaction_pin: Optional[str] = None
    loans: List[LoanResponse] = []
    cards: List[CardResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def trust_tier(self) -> str:
        if self.trust_score >= 90:
            return "Gold"
        if self.trust_score >= 70:
            return "Silver"
        return "Bronze"

    @computed_field
    @property
    def can_apply_loan(self) -> bool:
        return self.trust_score >= 60 and self.is_verified

# --- 9. ADMIN RESPONSE ---


class AdminUserResponse(UserResponse):
    is_admin: bool
    account_status: AccountStatus
    registration_ip: Optional[str] = None
    last_login_ip: Optional[str] = None
    recovery_email: Optional[str] = None
    pin_recovery_email: Optional[str] = None
    verification_status: str
    id_type: Optional[str] = None
    id_expiry_date: Optional[str] = None
    id_photo_url: Optional[str] = None
    selfie_photo_url: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[str] = None
    emergency_contact_id_url: Optional[str] = None
    bio: Optional[str] = None
    filmmaker_role: Optional[str] = None
    portfolio_url: Optional[str] = None
    past_project_url: Optional[str] = None
    failed_pin_attempts: Optional[int] = 0
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class PlatformStats(BaseModel):
    total_capital_injected: float = Field(...)
    available_treasury_balance: float = Field(...)
    estimated_revenue: float = Field(...)
    total_capital_out: float = Field(...)
    expected_collections_today: float = Field(...)
    active_users: int
    active_producers: int = 0
    active_loans: int = 0
    total_repaid: float = 0.0
    gold_tier_users: int
    pending_verifications: int
    pending_loan_requests: int
    default_rate: str
    currency: str = "PHP"


# --- 10. AUDIT ---


class AuditLogResponse(BaseModel):
    id: int
    admin_id: Optional[int] = None
    action: str
    target_id: Optional[int] = None
    timestamp: datetime
    ip_address: Optional[str] = None
    details: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# --- 11. VERIFICATION ---


class VerificationRequest(BaseModel):
    approve: bool
    reason: str = "No reason provided"


class PinVerify(BaseModel):
    pin: SecretStr = Field(..., description="6-digit security PIN")

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: SecretStr):
        pin_str = v.get_secret_value()
        if len(pin_str) != 6 or not pin_str.isdigit():
            raise ValueError("PIN must be exactly 6 digits")
        return v

# --- 12. NOTIFICATION ---


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- 13. SECURITY & OTP ---


class SecuritySetup(BaseModel):
    recovery_email: EmailStr
    transaction_pin: str = Field(..., min_length=6, max_length=6)
    pin_recovery_email: EmailStr


class ForgotPasswordRequest(BaseModel):
    recovery_email: EmailStr


class UnfreezeRequest(BaseModel):
    email: EmailStr


class RequestPinCode(BaseModel):
    pin_recovery_email: EmailStr


class ResetPasswordConfirm(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    new_password: str


class ResetPinConfirm(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)
    new_pin: str = Field(..., min_length=6, max_length=6)


class SecurityUpdateRequest(BaseModel):
    recovery_email: Optional[EmailStr] = None
    pin_recovery_email: Optional[EmailStr] = None
    otp_type: Optional[str] = "password"


class SecurityUpdateConfirm(BaseModel):
    otp_code: str
    new_password: Optional[str] = None
    old_password: Optional[str] = None
    new_transaction_pin: Optional[str] = None
    current_transaction_pin: Optional[str] = None


# --- 3. TOKEN ---


class Token(BaseModel):
    access_token: str
    token_type: str
    name: str
    is_admin: bool
    trust_score: int
    user_info: Optional[UserResponse] = None


# REBUILD AT THE VERY END
UserResponse.model_rebuild()
