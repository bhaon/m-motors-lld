"""US-04-04 : historique des contrats LLD — durée et date de début de contrat.

Revision ID: 005_us_04_04
Revises: 004_us_03_05
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "005_us_04_04"
down_revision = "004_us_03_05"
branch_labels = None
depends_on = None


def _has_column(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> bool:
    """Retourne True si la colonne existe déjà (migration idempotente)."""
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    """Ajoute les colonnes de gestion de contrat LLD sur la table dossiers."""
    bind = op.get_bind()
    with op.batch_alter_table("dossiers") as batch:
        if not _has_column(bind, table_name="dossiers", column_name="duree_mois"):
            batch.add_column(sa.Column("duree_mois", sa.Integer, nullable=True))
        if not _has_column(bind, table_name="dossiers", column_name="date_debut_contrat"):
            batch.add_column(sa.Column("date_debut_contrat", sa.Date, nullable=True))


def downgrade() -> None:
    """Retire les colonnes de gestion de contrat LLD."""
    with op.batch_alter_table("dossiers") as batch:
        batch.drop_column("date_debut_contrat")
        batch.drop_column("duree_mois")
