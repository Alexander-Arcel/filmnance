"""add rejected_sections to users

Revision ID: h6c7d8e9f0a1
Revises: g5b6c7d8e9f0
Create Date: 2026-05-04 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'h6c7d8e9f0a1'
down_revision = 'g5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column(
        'rejected_sections', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('users', 'rejected_sections')
