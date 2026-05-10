"""US-06-09 — Statut cloture (livraison effectuée, LLD démarre).

Revision ID: 012_us_06_09_cloture
Revises: 011_us_06_10_livraison
Create Date: 2026-05-10
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "012_us_06_09_cloture"
down_revision = "011_us_06_10_livraison"
branch_labels = None
depends_on = None

_PG_ENUM_NAME = "dossierstatusenum"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(
        text(f"""
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = '{_PG_ENUM_NAME}' AND e.enumlabel = 'cloture'
  ) THEN
    ALTER TYPE {_PG_ENUM_NAME} ADD VALUE 'cloture';
  END IF;
END
$do$;
""")
    )


def downgrade() -> None:
    """PostgreSQL : retrait de valeur ENUM non supporté sans recréer le type."""
    pass
