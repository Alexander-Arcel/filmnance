"""add delay/monthly-update rule engine fields

Revision ID: 4c6be64abff7
Revises: l0g1a2b3c4d5
Create Date: 2026-06-17

Adds the real columns the delay/monthly-update business rules need:
- loans.grace_months_remaining   (was only ever accessed via getattr/hasattr
  with a fallback of 0 — it never existed as a column, so the 3-month
  Development/Pre-Production grace policy silently did nothing)
- loans.delay_attempts_used      (enforce the 3-attempt lifetime cap)
- loans.schedule_push_days       (cumulative auto-escalation tracking)
- loan_schedules.delay_requested_at      (fixes "Request Date: —")
- loan_schedules.warning_sent_at
- loan_schedules.warning_penalty_applied
- loan_schedules.monthly_update_requested_at
- loan_schedules.monthly_update_status
- loan_schedules.monthly_update_id -> grace_updates.id
- grace_updates.schedule_id -> loan_schedules.id
"""
from alembic import op
import sqlalchemy as sa

revision = '4c6be64abff7'
down_revision = 'l0g1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('loans', sa.Column(
        'grace_months_remaining', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('loans', sa.Column(
        'delay_attempts_used', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('loans', sa.Column(
        'schedule_push_days', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('loans', sa.Column(
        'last_penalty_calculation', sa.DateTime(timezone=True), nullable=True))

    op.add_column('loan_schedules', sa.Column(
        'delay_requested_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('loan_schedules', sa.Column(
        'warning_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('loan_schedules', sa.Column(
        'warning_penalty_applied', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column('loan_schedules', sa.Column(
        'monthly_update_requested_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('loan_schedules', sa.Column(
        'monthly_update_status', sa.String(), nullable=True))
    op.add_column('loan_schedules', sa.Column(
        'monthly_update_id', sa.Integer(), sa.ForeignKey('grace_updates.id'), nullable=True))

    op.add_column('grace_updates', sa.Column(
        'schedule_id', sa.Integer(), sa.ForeignKey('loan_schedules.id'), nullable=True))

    # Backfill: pre-production/development loans that are already disbursed
    # and have never used any grace months should retroactively get their
    # 3 months, since the feature never actually worked before this point.
    op.execute("""
        UPDATE loans
        SET grace_months_remaining = 3
        WHERE status = 'disbursed'
          AND current_stage IN ('pre_production', 'development')
          AND COALESCE(grace_months_used, 0) = 0
    """)


def downgrade():
    op.drop_column('grace_updates', 'schedule_id')
    op.drop_column('loan_schedules', 'monthly_update_id')
    op.drop_column('loan_schedules', 'monthly_update_status')
    op.drop_column('loan_schedules', 'monthly_update_requested_at')
    op.drop_column('loan_schedules', 'warning_penalty_applied')
    op.drop_column('loan_schedules', 'warning_sent_at')
    op.drop_column('loan_schedules', 'delay_requested_at')
    op.drop_column('loans', 'last_penalty_calculation')
    op.drop_column('loans', 'schedule_push_days')
    op.drop_column('loans', 'delay_attempts_used')
    op.drop_column('loans', 'grace_months_remaining')
