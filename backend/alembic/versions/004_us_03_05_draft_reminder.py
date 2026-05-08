"""US-03-05 : rappel email pour dossiers brouillon non soumis depuis 30 jours.

Revision ID: 004_us_03_05
Revises: 003_us_02_03
Create Date: 2026-05-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "004_us_03_05"
down_revision = "003_us_02_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Ajoute la trace d'envoi du rappel brouillon (évite les envois répétés)."""
    with op.batch_alter_table("dossiers") as batch:
        batch.add_column(sa.Column("draft_reminder_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Retire la colonne de rappel brouillon."""
    with op.batch_alter_table("dossiers") as batch:
        batch.drop_column("draft_reminder_sent_at")
