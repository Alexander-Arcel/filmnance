from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from backend.models import models

# --- HELPER FUNCTIONS ---


def verify_luhn(card_number: str) -> bool:
    """Standard Luhn Algorithm to check for valid card number typos."""
    digits = [int(d) for d in card_number if d.isdigit()]
    if not digits:
        return False
    checksum = digits[-1]
    total = 0
    reverse_digits = digits[-2::-1]

    for i, d in enumerate(reverse_digits):
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d

    return (total + checksum) % 10 == 0


def validate_expiry_date(expiry_date: str) -> bool:
    """Checks if the card is expired (Format: MM/YY)."""
    try:
        current_date = datetime.now()
        # Parse MM/YY format
        exp_date = datetime.strptime(expiry_date, "%m/%y")

        # In credit cards, "05/26" means valid until the last day of May.
        # So it is only expired if the current year/month is strictly greater.
        if exp_date.year < current_date.year:
            return False
        if exp_date.year == current_date.year and exp_date.month < current_date.month:
            return False
        return True
    except ValueError:
        return False


def get_card_brand(card_number: str) -> str:
    """Identifies the card issuer based on standard BIN ranges."""
    if card_number.startswith('4'):
        return "Visa"
    elif card_number.startswith(('51', '52', '53', '54', '55')) or (2221 <= int(card_number[:4]) <= 2720):
        return "Mastercard"
    elif card_number.startswith(('34', '37')):
        return "American Express"
    elif card_number.startswith(('6011', '65')):
        return "Discover / Maya"
    return "Generic"

# --- MAIN SERVICE LOGIC ---


def add_new_card(db: Session, card_data, user_id: int):
    """
    Validates and saves a new payment method for a user.
    """
    # 1. Validate number format and Luhn Check
    if not card_data.card_number.isdigit() or not verify_luhn(card_data.card_number):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid card number. Please check for typos."
        )

    # 2. Check Expiry
    if not validate_expiry_date(card_data.expiry_date):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Card is expired or the date format (MM/YY) is invalid."
        )

    # 3. Check if user already has cards to set the Default
    existing_cards_count = db.query(models.PaymentCard).filter(
        models.PaymentCard.owner_id == user_id
    ).count()

    # If it's their first card, make it the default payment method
    is_default = True if existing_cards_count == 0 else False

    # 4. Prepare and Save (Masking the card number for security)
    brand = get_card_brand(card_data.card_number)
    last_four = card_data.card_number[-4:]

    new_card = models.PaymentCard(
        card_type=card_data.card_type,
        last_four=last_four,
        brand=brand,
        expiry_date=card_data.expiry_date,
        owner_id=user_id,
        is_default=is_default
    )

    try:
        db.add(new_card)
        db.commit()
        db.refresh(new_card)
        return new_card
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save payment method to database."
        )
