"""add pending_changes and approved_sections to users

Revision ID: g5b6c7d8e9f0
Revises: f1g2h3i4j5k6
Create Date: 2026-04-29 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'g5b6c7d8e9f0'
down_revision = 'f1g2h3i4j5k6'
branch_labels = None
depends_on = None


def _col_exists(table_name, col_name):
    bind = op.get_bind()
    result = bind.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table_name, "c": col_name})
    return result.scalar() > 0


def upgrade():
    if not _col_exists('users', 'pending_changes'):
        op.add_column('users',
                      sa.Column('pending_changes', sa.JSON(), nullable=True)
                      )
    op.execute(
        text("UPDATE users SET pending_changes = '{}' WHERE pending_changes IS NULL"))

    if not _col_exists('users', 'approved_sections'):
        op.add_column('users',
                      sa.Column('approved_sections', sa.JSON(), nullable=True)
                      )
    op.execute(text(
        "UPDATE users SET approved_sections = '{}' WHERE approved_sections IS NULL"))


def downgrade():
    if _col_exists('users', 'approved_sections'):
        op.drop_column('users', 'approved_sections')
    if _col_exists('users', 'pending_changes'):
        op.drop_column('users', 'pending_changes')
