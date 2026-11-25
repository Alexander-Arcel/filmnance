from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from backend.models import models
from backend.models.schemas import user_schemas
from backend.core.database import get_db
from backend.core.security import get_current_user
# Import your newly fixed service
from backend.services import payment_services

router = APIRouter(prefix="/cards", tags=["Payments"])


@router.post("/link", response_model=user_schemas.CardResponse)
def link_card(
    card_in: user_schemas.CardCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Links a new card to the user account using secure service logic.
    """
    # Use the service we just fixed! This handles Luhn, Expiry, and Brand detection.
    return payment_services.add_new_card(
        db=db,
        card_data=card_in,
        user_id=current_user.id
    )


@router.get("/my-cards", response_model=List[user_schemas.CardResponse])
def get_my_cards(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Returns all linked cards for the logged-in user.
    """
    return db.query(models.PaymentCard).filter(
        models.PaymentCard.owner_id == current_user.id
    ).all()


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Safely removes a card, ensuring the user actually owns it.
    """
    card = db.query(models.PaymentCard).filter(
        models.PaymentCard.id == card_id,
        models.PaymentCard.owner_id == current_user.id
    ).first()

    if not card:
        raise HTTPException(
            status_code=404, detail="Card not found or access denied")

    db.delete(card)
    db.commit()
    return None
