"""US-06-11 : alerte email superviseur — fin de contrat LLD à 3 mois.

Revision ID: 016_us_06_11
Revises: 015_us_11_01_pii
Create Date: 2026-05-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "016_us_06_11"
down_revision = "015_us_11_01_pii"
branch_labels = None
depends_on = None


def _has_column(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> bool:
    """Retourne True si la colonne existe déjà (migration idempotente)."""
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    """Ajoute la trace d'envoi de l'alerte rétention client (évite les doublons)."""
    bind = op.get_bind()
    with op.batch_alter_table("dossiers") as batch:
        if not _has_column(bind, table_name="dossiers", column_name="retention_alert_sent_at"):
            batch.add_column(sa.Column("retention_alert_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Retire la colonne d'alerte rétention."""
    with op.batch_alter_table("dossiers") as batch:
        batch.drop_column("retention_alert_sent_at")
