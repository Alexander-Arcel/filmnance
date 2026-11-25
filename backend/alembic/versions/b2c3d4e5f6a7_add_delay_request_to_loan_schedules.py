"""add_delay_request_to_loan_schedules

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-23 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # delay_requested: producer clicked "Request Delay" on this installment
    op.add_column('loan_schedules', sa.Column(
        'delay_requested', sa.Boolean(), nullable=True, server_default='false'))
    # delay_reason: optional message from producer explaining why
    op.add_column('loan_schedules', sa.Column(
        'delay_reason', sa.String(), nullable=True))
    # delay_status: null = no request, 'pending' = waiting admin, 'approved' = granted, 'declined' = declined
    op.add_column('loan_schedules', sa.Column(
        'delay_status', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('loan_schedules', 'delay_status')
    op.drop_column('loan_schedules', 'delay_reason')
    op.drop_column('loan_schedules', 'delay_requested')
