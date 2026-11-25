"""add is_overdue to loan_schedules

Revision ID: k9f0a1b2c3d4
Revises: j8e9f0a1b2c3
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'k9f0a1b2c3d4'
down_revision = 'j8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('loan_schedules') as batch_op:
        batch_op.add_column(
            sa.Column('is_overdue', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    with op.batch_alter_table('loan_schedules') as batch_op:
        batch_op.drop_column('is_overdue')
