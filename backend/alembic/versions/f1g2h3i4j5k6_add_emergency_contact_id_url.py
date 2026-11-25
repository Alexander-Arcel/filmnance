"""add emergency contact id url

Revision ID: f1g2h3i4j5k6
Revises: e1f2g3h4i5j6
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as _sa_inspect

revision = 'f1g2h3i4j5k6'
down_revision = 'e1f2g3h4i5j6'
branch_labels = None
depends_on = None


def _col_exists(table, col):
    return col in [c['name'] for c in _sa_inspect(op.get_bind()).get_columns(table)]


def upgrade():
    if not _col_exists('users', 'emergency_contact_id_url'):
        op.add_column('users', sa.Column(
            'emergency_contact_id_url', sa.String(), nullable=True
        ))


def downgrade():
    if _col_exists('users', 'emergency_contact_id_url'):
        op.drop_column('users', 'emergency_contact_id_url')
