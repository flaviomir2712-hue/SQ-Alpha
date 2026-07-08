"""add user.is_admin

Revision ID: f4a8c2e1b3d5
Revises: d91ed58785ab
Create Date: 2026-07-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f4a8c2e1b3d5'
down_revision = 'd91ed58785ab'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))


def downgrade():
    op.drop_column('user', 'is_admin')
