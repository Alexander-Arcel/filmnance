"""Add contact_messages table

Revision ID: j8e9f0a1b2c3
Revises: i7d8e9f0a1b2
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'j8e9f0a1b2c3'
down_revision = 'i7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'contact_messages' not in existing_tables:
        op.create_table(
            'contact_messages',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey(
                'users.id'), nullable=True),
            sa.Column('from_name', sa.String(), nullable=True),
            sa.Column('from_email', sa.String(), nullable=True),
            sa.Column('subject', sa.String(), nullable=True),
            sa.Column('message', sa.Text(), nullable=True),
            sa.Column('sent_at', sa.DateTime(),
                      server_default=sa.text('NOW()')),
            sa.Column('is_read', sa.Boolean(), server_default='false'),
        )


def downgrade() -> None:
    op.drop_table('contact_messages')
