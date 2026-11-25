"""add grace_schedule_extended to loans

Revision ID: m1n2o3p4q5r6
Revises: 4c6be64abff7
Create Date: 2026-06-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'm1n2o3p4q5r6'
down_revision = '4c6be64abff7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('loans', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('grace_schedule_extended', sa.Boolean(),
                      nullable=True, server_default=sa.false())
        )


def downgrade():
    with op.batch_alter_table('loans', schema=None) as batch_op:
        batch_op.drop_column('grace_schedule_extended')
