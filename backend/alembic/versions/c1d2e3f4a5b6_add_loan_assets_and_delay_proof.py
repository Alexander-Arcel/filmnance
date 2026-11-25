"""add_loan_assets_and_delay_proof

Adds lookbook_url and trailer_url to loans table.
Adds delay_proof_url to loan_schedules table.
Also restores pin_recovery_otp to users (dropped in a previous migration but still
referenced in models.py).

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-23 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column already exists so we can run this migration safely."""
    from alembic import op as _op
    from sqlalchemy import inspect, text
    conn = _op.get_bind()
    insp = inspect(conn)
    cols = [c['name'] for c in insp.get_columns(table)]
    return column in cols


def upgrade() -> None:
    # ── loans table ──────────────────────────────────────────────────────────
    if not _column_exists('loans', 'lookbook_url'):
        op.add_column('loans', sa.Column(
            'lookbook_url', sa.String(), nullable=True))

    if not _column_exists('loans', 'trailer_url'):
        op.add_column('loans', sa.Column(
            'trailer_url', sa.String(), nullable=True))

    # ── loan_schedules table ─────────────────────────────────────────────────
    if not _column_exists('loan_schedules', 'delay_proof_url'):
        op.add_column('loan_schedules', sa.Column(
            'delay_proof_url', sa.String(), nullable=True))

    # ── users table — restore pin_recovery_otp if it was dropped ─────────────
    if not _column_exists('users', 'pin_recovery_otp'):
        op.add_column('users', sa.Column(
            'pin_recovery_otp', sa.String(), nullable=True))


def downgrade() -> None:
    if _column_exists('users', 'pin_recovery_otp'):
        op.drop_column('users', 'pin_recovery_otp')
    if _column_exists('loan_schedules', 'delay_proof_url'):
        op.drop_column('loan_schedules', 'delay_proof_url')
    if _column_exists('loans', 'trailer_url'):
        op.drop_column('loans', 'trailer_url')
    if _column_exists('loans', 'lookbook_url'):
        op.drop_column('loans', 'lookbook_url')
