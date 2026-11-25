"""add past_project_urls to users

Revision ID: i7d8e9f0a1b2
Revises: h6c7d8e9f0a1
Create Date: 2026-05-05 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'i7d8e9f0a1b2'
down_revision = 'h6c7d8e9f0a1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column(
        'past_project_urls', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('users', 'past_project_urls')
