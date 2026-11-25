"""add_all_missing_loan_columns

Adds every column that models.py defines but the database is missing.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-03-23 14:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col(table: str, column: str) -> bool:
    """Return True if column already exists in table."""
    conn = op.get_bind()
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


def upgrade() -> None:
    # ── loans ─────────────────────────────────────────────────────────────────
    if not _col("loans", "admin_notes"):
        op.add_column("loans", sa.Column(
            "admin_notes", sa.Text(), nullable=True))

    if not _col("loans", "project_description"):
        op.add_column("loans", sa.Column(
            "project_description", sa.Text(), nullable=True))

    if not _col("loans", "is_on_production_break"):
        op.add_column("loans", sa.Column("is_on_production_break", sa.Boolean(),
                                         nullable=True, server_default="false"))

    if not _col("loans", "lookbook_url"):
        op.add_column("loans", sa.Column(
            "lookbook_url", sa.String(), nullable=True))

    if not _col("loans", "trailer_url"):
        op.add_column("loans", sa.Column(
            "trailer_url", sa.String(), nullable=True))

    # ── loan_schedules ────────────────────────────────────────────────────────
    if not _col("loan_schedules", "delay_requested"):
        op.add_column("loan_schedules", sa.Column("delay_requested", sa.Boolean(),
                                                  nullable=True, server_default="false"))

    if not _col("loan_schedules", "delay_reason"):
        op.add_column("loan_schedules", sa.Column(
            "delay_reason", sa.Text(), nullable=True))

    if not _col("loan_schedules", "delay_status"):
        op.add_column("loan_schedules", sa.Column(
            "delay_status", sa.String(), nullable=True))

    if not _col("loan_schedules", "delay_proof_url"):
        op.add_column("loan_schedules", sa.Column(
            "delay_proof_url", sa.String(), nullable=True))


def downgrade() -> None:
    for col in ["delay_proof_url", "delay_status", "delay_reason", "delay_requested"]:
        if _col("loan_schedules", col):
            op.drop_column("loan_schedules", col)

    for col in ["trailer_url", "lookbook_url", "is_on_production_break",
                "project_description", "admin_notes"]:
        if _col("loans", col):
            op.drop_column("loans", col)
