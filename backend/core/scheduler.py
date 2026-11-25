"""
Background scheduler for time-based rule-engine sweeps.

Uses APScheduler's BackgroundScheduler so it runs inside the same FastAPI
process (no separate worker needed for this project's scale). Started
once from main.py on app startup, stopped on shutdown.
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from backend.core.database import SessionLocal
from backend.services.delay_sweep import run_sweep

logger = logging.getLogger(__name__)

_scheduler = None

# Runs every 3 hours. The sweep logic itself is idempotent per-day (it only
# pushes the schedule once per calendar day of continued admin inaction and
# only fires each penalty once), so running it more than once a day is safe
# — it just means escalations are detected sooner rather than later.
SWEEP_INTERVAL_HOURS = 3


def _run_sweep_job():
    db = SessionLocal()
    try:
        stats = run_sweep(db)
        logger.info(f"Delay/monthly-update sweep complete: {stats}")
    except Exception as e:
        logger.error(f"Delay/monthly-update sweep crashed: {e}")
    finally:
        db.close()


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_sweep_job,
        "interval",
        hours=SWEEP_INTERVAL_HOURS,
        id="delay_monthly_update_sweep",
        next_run_time=None,  # don't fire immediately on boot; wait one interval
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        f"Background scheduler started — sweep runs every {SWEEP_INTERVAL_HOURS}h.")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
