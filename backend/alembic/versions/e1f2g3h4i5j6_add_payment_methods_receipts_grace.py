"""add payment methods, receipts, grace and advance tracking

Revision ID: e1f2g3h4i5j6
Revises: d2e3f4a5b6c7
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as _sa_inspect

revision = 'e1f2g3h4i5j6'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in _sa_inspect(op.get_bind()).get_table_names()


def _col_exists(table: str, col: str) -> bool:
    return col in [c['name'] for c in _sa_inspect(op.get_bind()).get_columns(table)]


def upgrade():
    # ── New columns on loans ──────────────────────────────────────────────────
    loan_cols = [
        ('grace_months_granted',   sa.Integer(), '0'),
        ('grace_months_used',      sa.Integer(), '0'),
        ('grace_updates_received', sa.Integer(), '0'),
        ('advance_payment_streak', sa.Integer(), '0'),
        ('total_advance_payments', sa.Integer(), '0'),
        ('three_give_total',       sa.Integer(), '0'),
        ('three_give_released',    sa.Integer(), '0'),
        ('disbursement_method',    sa.String(),  None),
        ('disbursement_account',   sa.String(),  None),
        ('repayment_method',       sa.String(),  None),
        ('three_give_next_at',     sa.DateTime(timezone=True), None),
    ]
    for col_name, col_type, default in loan_cols:
        if not _col_exists('loans', col_name):
            kwargs = {'nullable': True}
            if default is not None:
                kwargs['server_default'] = default
            op.add_column('loans', sa.Column(col_name, col_type, **kwargs))

    # ── payment_methods ───────────────────────────────────────────────────────
    if not _table_exists('payment_methods'):
        op.create_table(
            'payment_methods',
            sa.Column('id',             sa.Integer(),
                      primary_key=True, autoincrement=True),
            sa.Column('owner_id',       sa.Integer(), sa.ForeignKey(
                'users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('method_type',    sa.String(),  nullable=False),
            sa.Column('account_name',   sa.String(),  nullable=False),
            sa.Column('account_number', sa.String(),  nullable=False),
            sa.Column('is_default',     sa.Boolean(),
                      server_default='false', nullable=False),
            sa.Column('is_verified',    sa.Boolean(),
                      server_default='false', nullable=False),
            sa.Column('created_at',     sa.DateTime(timezone=True),
                      server_default=sa.text('now()')),
        )

    # ── disbursement_receipts ─────────────────────────────────────────────────
    if not _table_exists('disbursement_receipts'):
        op.create_table(
            'disbursement_receipts',
            sa.Column('id',               sa.Integer(),
                      primary_key=True, autoincrement=True),
            sa.Column('loan_id',          sa.Integer(), sa.ForeignKey(
                'loans.id', ondelete='CASCADE'), nullable=False),
            sa.Column('reference_number', sa.String(),
                      unique=True, nullable=False),
            sa.Column('amount',           sa.Numeric(18, 2), nullable=False),
            sa.Column('method',           sa.String(),  nullable=False),
            sa.Column('account_name',     sa.String(),  nullable=False),
            sa.Column('account_number',   sa.String(),  nullable=False),
            sa.Column('admin_note',       sa.Text(),    nullable=True),
            sa.Column('issued_at',        sa.DateTime(
                timezone=True), server_default=sa.text('now()')),
        )

    # ── repayment_receipts ────────────────────────────────────────────────────
    if not _table_exists('repayment_receipts'):
        op.create_table(
            'repayment_receipts',
            sa.Column('id',               sa.Integer(),
                      primary_key=True, autoincrement=True),
            sa.Column('loan_id',          sa.Integer(), sa.ForeignKey(
                'loans.id', ondelete='CASCADE'), nullable=False),
            sa.Column('transaction_id',   sa.Integer(),
                      sa.ForeignKey('transactions.id'), nullable=True),
            sa.Column('reference_number', sa.String(),  nullable=True),
            sa.Column('amount',           sa.Numeric(18, 2), nullable=False),
            sa.Column('method',           sa.String(),  nullable=False),
            sa.Column('proof_url',        sa.String(),  nullable=True),
            sa.Column('status',           sa.String(),
                      server_default='pending', nullable=False),
            sa.Column('submitted_at',     sa.DateTime(
                timezone=True), server_default=sa.text('now()')),
            sa.Column('confirmed_at',     sa.DateTime(
                timezone=True), nullable=True),
        )


def downgrade():
    # Drop tables in reverse dependency order
    for tbl in ('repayment_receipts', 'disbursement_receipts', 'payment_methods'):
        if _table_exists(tbl):
            op.drop_table(tbl)

    # Drop new loan columns
    for col in [
        'grace_months_granted', 'grace_months_used', 'grace_updates_received',
        'advance_payment_streak', 'total_advance_payments', 'three_give_total',
        'three_give_released', 'three_give_next_at',
        'disbursement_method', 'disbursement_account', 'repayment_method',
    ]:
        if _col_exists('loans', col):
            op.drop_column('loans', col)
