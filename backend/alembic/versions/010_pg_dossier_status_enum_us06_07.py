"""Étend la valeur du type ENUM PostgreSQL dossierstatusenum (US-06-07).

Sans cette migration, psql rejette INSERT/UPDATE avec en_signature ou attente_livraison
car le CREATE TYPE initial ne reprend pas les nouvelles valeurs du modèle Python.

Revision ID: 010_pg_dossier_status
Revises: 009_us_06_07
Create Date: 2026-05-10
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "010_pg_dossier_status"
down_revision = "009_us_06_07"
branch_labels = None
depends_on = None

# Nom du type ENUM généré par SQLAlchemy / PostgreSQL (minuscules usuellement).
_PG_ENUM_NAME = "dossierstatusenum"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    values = ("en_signature", "attente_livraison")
    for lbl in values:
        op.execute(
            text(f"""
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = '{_PG_ENUM_NAME}' AND e.enumlabel = '{lbl}'
  ) THEN
    ALTER TYPE {_PG_ENUM_NAME} ADD VALUE '{lbl}';
  END IF;
END
$do$;
""")
        )


def downgrade() -> None:
    """PostgreSQL ne permet pas de retirer des valeurs d'un ENUM sans recréer le type."""
    pass
