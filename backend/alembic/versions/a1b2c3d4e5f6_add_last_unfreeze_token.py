"""add_last_unfreeze_token

Revision ID: a1b2c3d4e5f6
Revises: 48fad248d3dd
Create Date: 2026-03-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '48fad248d3dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add last_unfreeze_token column to users table."""
    op.add_column('users', sa.Column(
        'last_unfreeze_token', sa.String(), nullable=True))


def downgrade() -> None:
    """Remove last_unfreeze_token column from users table."""
    op.drop_column('users', 'last_unfreeze_token')
