"""add user.email_verified

Tanda 7E — Confirmación de email al registrarse:

  Nueva columna `user.email_verified` (boolean NOT NULL):
    - server_default 'true' → TODOS los usuarios existentes quedan
      verificados automáticamente (son anteriores al sistema de
      verificación; bloquearles sería injusto y rompería sesiones).
    - Los usuarios NUEVOS nacen en False (default del modelo en el ORM)
      hasta que clican el link del email de confirmación.

Aditiva con server_default → deploy seguro en Render (sin backfill
manual, sin bloquear la tabla).

Revision ID: e9b3c7a5d481
Revises: c4e8a1f6d203
Create Date: 2026-06-11 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e9b3c7a5d481'
down_revision = 'c4e8a1f6d203'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade():
    op.drop_column("user", "email_verified")
