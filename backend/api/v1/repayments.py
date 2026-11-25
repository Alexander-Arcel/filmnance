from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime, timezone
from backend.core.database import get_db
from backend.core.security import get_current_user, verify_transaction_auth
from backend.models import models

router = APIRouter(prefix="/repayments", tags=["Repayments"])


@router.post("")
def submit_repayment(
    loan_id: int,
    amount: float,
    transaction_pin: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    User submits a repayment.

    Simplified flow:
    - Only requires loan_id, amount, and transaction_pin.
    - No proof upload — admin already has all loan and movie details for transparency.
    - No manual reference number — system auto-generates one.
    - Payment method is automatically read from the loan's disbursement_method
      (set by the user when they applied for the loan).

    Admin confirms → processes repayment + notifies user with full receipt.
    """
    if current_user.account_status != "active":
        raise HTTPException(status_code=403, detail="Account restricted.")

    verify_transaction_auth(transaction_pin, current_user, db)

    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.owner_id == current_user.id
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    if loan.status not in ["disbursed", "completed"]:
        raise HTTPException(
            status_code=400, detail="This loan is not active for repayment.")

    if float(amount) <= 0:
        raise HTTPException(
            status_code=400, detail="Amount must be greater than zero.")

    # Auto-generate reference number
    import uuid
    auto_ref = f"REPAY-{uuid.uuid4().hex[:10].upper()}"

    # Auto-read payment method from the loan (chosen during loan application)
    method = getattr(loan, 'disbursement_method', None) or "On-file account"

    receipt = models.RepaymentReceipt(
        loan_id=loan_id,
        reference_number=auto_ref,
        amount=Decimal(str(amount)),
        method=method,
        proof_url=None,
        status="pending"
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)

    return {
        "message": "Repayment submitted successfully. Awaiting admin confirmation.",
        "receipt_id": receipt.id,
        "reference_number": auto_ref,
        "method": method,
        "status": receipt.status
    }
