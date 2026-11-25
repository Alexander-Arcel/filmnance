"""drop circular FK loan_schedules.monthly_update_id

grace_updates.schedule_id already links loan_schedules -> grace_updates in
one direction. Having loan_schedules.monthly_update_id -> grace_updates.id
as well created a circular dependency between the two tables, which makes
Base.metadata.drop_all() / create_all() (and `alembic downgrade` to a point
before both tables exist) fail with:

    sqlalchemy.exc.CircularDependencyError: Can't sort tables for DROP...

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-06-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'n2o3p4q5r6s7'
down_revision = 'm1n2o3p4q5r6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('loan_schedules', schema=None) as batch_op:
        batch_op.drop_constraint(
            'loan_schedules_monthly_update_id_fkey', type_='foreignkey')
        batch_op.drop_column('monthly_update_id')


def downgrade():
    with op.batch_alter_table('loan_schedules', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('monthly_update_id', sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            'loan_schedules_monthly_update_id_fkey',
            'grace_updates', ['monthly_update_id'], ['id']
        )
