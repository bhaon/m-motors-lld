"""US-06-10 — Statut livraison_planifiee, colonne livraison_prevue_at.

Revision ID: 011_us_06_10_livraison
Revises: 010_pg_dossier_status
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision = "011_us_06_10_livraison"
down_revision = "010_pg_dossier_status"
branch_labels = None
depends_on = None

_PG_ENUM_NAME = "dossierstatusenum"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            text(f"""
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = '{_PG_ENUM_NAME}' AND e.enumlabel = 'livraison_planifiee'
  ) THEN
    ALTER TYPE {_PG_ENUM_NAME} ADD VALUE 'livraison_planifiee';
  END IF;
END
$do$;
""")
        )
    op.add_column(
        "dossiers",
        sa.Column("livraison_prevue_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Retire la colonne ; la valeur ENUM PostgreSQL subsiste."""
    op.drop_column("dossiers", "livraison_prevue_at")
