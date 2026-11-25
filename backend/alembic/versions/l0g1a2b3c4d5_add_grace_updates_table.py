"""add grace_updates table

Revision ID: l0g1a2b3c4d5
Revises: k9f0a1b2c3d4
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'l0g1a2b3c4d5'
down_revision = 'k9f0a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'grace_updates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('loan_id', sa.Integer(), sa.ForeignKey(
            'loans.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey(
            'users.id'), nullable=False),
        sa.Column('update_text', sa.Text(), nullable=False),
        sa.Column('photo_url', sa.String(), nullable=True),
        sa.Column('reference', sa.String(), nullable=True),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_table('grace_updates')
