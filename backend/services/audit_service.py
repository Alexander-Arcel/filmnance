import json
import logging
from sqlalchemy.orm import Session
from backend.models import models
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    admin_id: int,
    action: str,
    ip: str,
    target_id: int = None,
    details: any = None
):
    """
    Enhanced Audit Logging for Philippine Lending Platform:
    - Standardizes JSON details for easy auditing.
    - Uses SAVEPOINT (begin_nested) so a log failure won't rollback the main action.
    - Includes automatic timestamping.
    """
    # Create a Savepoint: If logging fails, we only roll back the LOG, not the LOAN.
    db.begin_nested()

    try:
        # 1. Clean up details
        formatted_details = None
        if details:
            if isinstance(details, (dict, list)):
                formatted_details = json.dumps(details)
            elif hasattr(details, "dict"):  # Handles Pydantic models
                formatted_details = json.dumps(details.dict())
            else:
                formatted_details = str(details)

        # 2. Create the record
        new_log = models.AuditLog(
            admin_id=admin_id,
            action=action,
            target_id=target_id,
            ip_address=ip,
            details=formatted_details,
            timestamp=datetime.now(timezone.utc)  # Timezone-aware UTC
        )

        db.add(new_log)
        db.flush()  # Send to DB
        db.commit()  # Persist the log record

    except Exception as e:
        # If logging fails, we only roll back the savepoint
        db.rollback()
        logger.error(
            f"AUDIT_LOG_FAILURE: Action '{action}' for Admin {admin_id}. Error: {e}")
