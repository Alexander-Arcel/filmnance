from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Boolean, Text, JSON
from sqlalchemy.orm import relationship, Session
from sqlalchemy.sql import func
from fastapi import Depends, HTTPException, status
from jose import JWTError, jwt
from backend.core.database import Base, get_db
from datetime import datetime, timezone


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)

    # --- 1. BASIC INFO & IDENTITY ---
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)

    # --- 2. FILMMAKER PROFESSIONAL IDENTITY ---
    portfolio_url = Column(String, nullable=True)  # Behance/Vimeo/IMDB
    filmmaker_role = Column(String, nullable=True)  # Director, Producer, etc.
    bio = Column(Text, nullable=True)
    past_project_url = Column(String, nullable=True)
    past_project_urls = Column(
        JSON, nullable=True, default=[])  # up to 5 past projects

    # --- 3. SECURITY & RECOVERY ---
    recovery_email = Column(String, nullable=True, index=True)
    pin_recovery_email = Column(String, nullable=True)
    transaction_pin = Column(String, nullable=True)

    # EMERGENCY CONTACTS (Expanded for 15-point Identity Logic)
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)
    emergency_contact_relationship = Column(String, nullable=True)
    emergency_contact_email = Column(String, nullable=True)
    emergency_contact_id_url = Column(
        String, nullable=True)  # Gov ID photo of EC

    # OTP & LOCK LOGIC
    otp_code = Column(String, nullable=True)
    otp_expiry = Column(DateTime, nullable=True)
    pin_recovery_otp = Column(String, nullable=True)

    # --- 4. MULTI-DIMENSIONAL TRUST PILLARS (50-25-25 Logic) ---
    identity_trust = Column(Integer, default=0)   # Max 50: KYC + Profile Data
    behavior_trust = Column(Integer, default=25)  # Max 25: Starts at 25
    financial_trust = Column(Integer, default=0)  # Max 25: Repayments

    # Overall sum of the 3 pillars above
    trust_score = Column(Integer, default=25, index=True)

    # --- 5. VERIFICATION & TIERS ---
    # trust_tier 0: Unverified, 1: Silver (ID+Profile), 2: Gold (90+ Score)
    trust_tier = Column(Integer, default=0)
    is_verified = Column(Boolean, default=False)
    verification_status = Column(String, default="unverified")

    # --- 6. PHILIPPINE KYC DATA ---
    id_type = Column(String, nullable=True)
    id_expiry_date = Column(DateTime, nullable=True)
    id_photo_url = Column(String, nullable=True)
    selfie_photo_url = Column(String, nullable=True)

    # --- 7. ACCOUNT STATUS & RISK ---
    account_status = Column(String, default="active")
    failed_pin_attempts = Column(Integer, default=0)
    total_behavior_penalties = Column(Integer, default=0)
    pin_locked_until = Column(DateTime, nullable=True)

    last_login_at = Column(DateTime(timezone=True), nullable=True)
    registration_ip = Column(String, nullable=True)
    last_login_ip = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # --- 9. ACCOUNT FREEZE RESEND TRACKING ---
    # How many unfreeze emails resent (max 3), resets after account unfreezes
    unfreeze_resend_count = Column(Integer, default=0)
    # When the last resend was requested (used for escalating cooldown)
    unfreeze_last_resend_at = Column(DateTime(timezone=True), nullable=True)

    # --- 10. PENDING CHANGES TRACKING ---
    # Stores ONLY the fields that changed since the last admin approval.
    # When admin reviews, they see only these new/changed fields.
    # Cleared to {} when admin approves or rejects.
    # Example: {"filmmaker_role": "Director", "bio": "New bio text"}
    pending_changes = Column(JSON, nullable=True, default={})
    rejected_sections = Column(JSON, nullable=True, default={})

    # Tracks which profile sections have already been approved by admin.
    # Example: {"professional": true, "past_project": true}
    # Used to prevent re-queueing already-approved sections when user re-saves after rejection.
    approved_sections = Column(JSON, nullable=True, default={})

    # --- 8. RELATIONSHIPS ---
    loans = relationship("Loan", back_populates="owner")
    cards = relationship("PaymentCard", back_populates="owner")
    documents = relationship("UserDocument", back_populates="owner")
    notifications = relationship("Notification", back_populates="owner")


class Loan(Base):
    __tablename__ = "loans"
    id = Column(Integer, primary_key=True, index=True)

    amount = Column(Numeric(precision=18, scale=2,
                    asdecimal=True), nullable=False)
    remaining_amount = Column(
        Numeric(precision=18, scale=2, asdecimal=True), nullable=False)
    interest_rate = Column(
        Numeric(precision=5, scale=4, asdecimal=True), nullable=False)
    monthly_payment = Column(
        Numeric(precision=18, scale=2, asdecimal=True), default=0.00)
    total_penalty_paid = Column(
        Numeric(precision=18, scale=2, asdecimal=True), default=0.0)

    duration_months = Column(Integer, nullable=False)
    # pending, approved, disbursed, defaulted, completed
    status = Column(String, default="pending")

    project_title = Column(String, index=True)
    script_url = Column(String, nullable=True)
    lookbook_url = Column(String, nullable=True)
    trailer_url = Column(String, nullable=True)
    current_stage = Column(String, default="pre_production")

    next_payment_due = Column(DateTime(timezone=True), nullable=True)
    is_overdue = Column(Boolean, default=False)
    missed_payments_count = Column(Integer, default=0)
    # Was referenced in loan_service.apply_late_penalty_logic() but never
    # existed as a column — every call to that function raised AttributeError.
    last_penalty_calculation = Column(DateTime(timezone=True), nullable=True)

    admin_notes = Column(Text, nullable=True)
    project_description = Column(Text, nullable=True)
    is_on_production_break = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="loans")
    transactions = relationship("Transaction", back_populates="loan")
    repayment_schedule = relationship(
        "LoanSchedule", back_populates="loan", cascade="all, delete-orphan")
    requirements_list = Column(JSON, nullable=False, default=[])
    purpose = Column(Text, nullable=True)

    # --- PRE-PRODUCTION GRACE & ADVANCE PAYMENT TRACKING ---
    grace_months_granted = Column(
        Integer, default=0)   # 0 or 2 (pre-prod only)
    # consumed grace months
    grace_months_used = Column(Integer, default=0)
    grace_updates_received = Column(Integer, default=0)  # monthly updates sent
    # NOTE: was referenced via getattr()/hasattr() everywhere but never existed
    # as a real column — the 3-month Development/Pre-Production grace policy
    # silently never worked. Now a real column. Set to 3 at disbursement for
    # Development/Pre-Production loans, decremented by 1 on each APPROVED
    # monthly update, and floored at 0.
    grace_months_remaining = Column(Integer, default=0)
    # True once the +3 month repayment extension has been appended to the
    # schedule after the producer completed all 3 grace months — prevents
    # appending the extension more than once.
    grace_schedule_extended = Column(Boolean, default=False)
    advance_payment_streak = Column(
        Integer, default=0)  # consecutive advance pays
    total_advance_payments = Column(
        Integer, default=0)  # lifetime advance pays

    # --- DELAY / MONTHLY UPDATE RULE ENGINE ---
    # Lifetime count of delay requests submitted on this loan (max 3 total).
    delay_attempts_used = Column(Integer, default=0)
    # Cumulative number of days the WHOLE schedule has been auto-pushed
    # forward because admin failed to act on a delay/monthly-update request
    # within the grace window. Applied uniformly to all remaining unpaid
    # installments by the background scheduler.
    schedule_push_days = Column(Integer, default=0)

    # --- DISBURSEMENT & REPAYMENT CHANNEL ---
    # GCash, Maya, BDO, etc.
    disbursement_method = Column(String, nullable=True)
    disbursement_account = Column(String, nullable=True)  # account number/name
    # chosen repayment channel
    repayment_method = Column(String, nullable=True)

    # --- 3-GIVE PROTECTION (loans 500k-1M, pre-prod only) ---
    # Splits disbursement into 3 tranches
    # 0 = not applicable; 3 = active
    three_give_total = Column(Integer, default=0)
    # how many tranches released
    three_give_released = Column(Integer, default=0)
    three_give_next_at = Column(DateTime(timezone=True), nullable=True)


class GraceUpdate(Base):
    """Monthly production update submitted by a producer.

    Used both during the pre-production/development 3-month grace period
    AND as the regular monthly update mechanism for installments in any
    phase. ``schedule_id`` links it to the specific installment period it
    was submitted for, so the "1 attempt per due-date month" rule can be
    enforced precisely.
    """
    __tablename__ = "grace_updates"
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    schedule_id = Column(Integer, ForeignKey(
        "loan_schedules.id"), nullable=True)
    update_text = Column(Text, nullable=False)
    photo_url = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    # pending, approved, rejected (legacy data may still have "reviewed")
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True),
                        default=lambda: datetime.now(timezone.utc))
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, nullable=True)

    loan = relationship("Loan", foreign_keys=[loan_id])
    user = relationship("User", foreign_keys=[user_id])


class LoanSchedule(Base):
    __tablename__ = "loan_schedules"
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"))
    installment_number = Column(Integer)
    due_date = Column(DateTime(timezone=True))
    amount_due = Column(Numeric(precision=18, scale=2))
    status = Column(String, default="unpaid")  # unpaid, paid, partial
    # Delay request fields
    delay_requested = Column(Boolean, default=False)
    delay_reason = Column(Text, nullable=True)
    # pending, approved, declined
    delay_status = Column(String, nullable=True)
    # proof photo/video from producer
    delay_proof_url = Column(String, nullable=True)
    # True once the 3-day grace penalty has been applied for this installment
    is_overdue = Column(Boolean, default=False)

    # --- DELAY / MONTHLY UPDATE RULE ENGINE FIELDS ---
    # When the user actually submitted the delay request (fixes "Request
    # Date: —" always showing blank — this timestamp never existed before).
    delay_requested_at = Column(DateTime(timezone=True), nullable=True)
    # When the 3-day "you're about to be overdue" warning was triggered for
    # this installment. Used so we only warn once and can measure the
    # 3-day / 5-day windows described in the delay/monthly-update policy.
    warning_sent_at = Column(DateTime(timezone=True), nullable=True)
    # True once the -2 trust point "missed monthly update on last warning
    # day" penalty has been applied for this installment period.
    warning_penalty_applied = Column(Boolean, default=False)
    # Monthly-update fields (mirrors delay fields, scoped to this installment
    # period so "1 attempt per due-date month" can be enforced precisely).
    monthly_update_requested_at = Column(
        DateTime(timezone=True), nullable=True)
    # pending, approved, rejected
    monthly_update_status = Column(String, nullable=True)
    # NOTE: there is intentionally no monthly_update_id FK back to
    # grace_updates here. grace_updates.schedule_id already links the two
    # tables in the other direction; having a FK on both sides created a
    # circular dependency that breaks Base.metadata.drop_all()/create_all()
    # (SQLAlchemy can't determine drop order between two mutually-referencing
    # tables without explicitly named, deferrable constraints). If you need
    # "the grace update for this schedule row", query
    # GraceUpdate.schedule_id == schedule.id instead.

    loan = relationship("Loan", back_populates="repayment_schedule")


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Numeric(precision=18, scale=2), nullable=False)
    transaction_type = Column(String, default="repayment")
    reference_number = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=True)
    loan = relationship("Loan", back_populates="transactions")
    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class PaymentCard(Base):
    __tablename__ = "payment_cards"
    id = Column(Integer, primary_key=True, index=True)
    card_type = Column(String)
    last_four = Column(String(4))
    brand = Column(String)
    expiry_date = Column(String)
    is_default = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="cards")


class PaymentMethod(Base):
    """Stores user-linked payment accounts (GCash, Maya, BDO, etc.)"""
    __tablename__ = "payment_methods"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    # gcash, maya, bdo, bpi, etc.
    method_type = Column(String, nullable=False)
    account_name = Column(String, nullable=False)
    # last-4 or full depending on type
    account_number = Column(String, nullable=False)
    is_default = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", backref="payment_methods")


class DisbursementReceipt(Base):
    """Admin-issued receipt when funds are disbursed to a producer."""
    __tablename__ = "disbursement_receipts"
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id", ondelete="CASCADE"))
    reference_number = Column(String, unique=True, index=True)
    amount = Column(Numeric(precision=18, scale=2, asdecimal=True))
    method = Column(String)          # GCash, Maya, BDO, etc.
    account_name = Column(String)
    account_number = Column(String)
    admin_note = Column(Text, nullable=True)
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    loan = relationship("Loan", backref="disbursement_receipt")


class RepaymentReceipt(Base):
    """User-submitted proof of repayment; admin confirms."""
    __tablename__ = "repayment_receipts"
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id", ondelete="CASCADE"))
    transaction_id = Column(Integer, ForeignKey(
        "transactions.id"), nullable=True)
    # GCash ref, bank ref, etc.
    reference_number = Column(String, nullable=True)
    amount = Column(Numeric(precision=18, scale=2, asdecimal=True))
    method = Column(String)
    proof_url = Column(String, nullable=True)          # screenshot upload
    # pending, confirmed, rejected
    status = Column(String, default="pending")
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    loan = relationship("Loan", backref="repayment_receipts")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey(
        "users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String)
    target_id = Column(Integer, nullable=True)
    ip_address = Column(String)
    details = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    admin = relationship("User")


class UserDocument(Base):
    __tablename__ = "user_documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    document_type = Column(String)
    file_path = Column(String)
    uploaded_at = Column(DateTime, default=func.now())
    owner = relationship("User", back_populates="documents")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    owner = relationship("User", back_populates="notifications")


class Treasury(Base):
    __tablename__ = "treasury"
    id = Column(Integer, primary_key=True, index=True)
    total_injected = Column(
        Numeric(precision=18, scale=2, asdecimal=True), default=0.00)
    available_balance = Column(
        Numeric(precision=18, scale=2, asdecimal=True), default=0.00)
    total_revenue = Column(
        Numeric(precision=18, scale=2, asdecimal=True), default=0.00)
    last_updated = Column(DateTime(timezone=True), onupdate=func.now())


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    from_name = Column(String)
    from_email = Column(String)
    subject = Column(String)
    message = Column(Text)
    sent_at = Column(DateTime, default=func.now())
    is_read = Column(Boolean, default=False)
