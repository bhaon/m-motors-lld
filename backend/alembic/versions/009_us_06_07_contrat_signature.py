"""US-06-07 — Contrat généré, statuts en_signature / attente_livraison, signature par lien.

Revision ID: 009_us_06_07
Revises: 008_us_07_03
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009_us_06_07"
down_revision = "008_us_07_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dossier_contrats",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dossier_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        sa.Column("signature_token_hash", sa.String(length=64), nullable=True),
        sa.Column("signature_token_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signature_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dossier_id"),
        sa.UniqueConstraint("signature_token_hash"),
    )
    op.create_index("ix_dossier_contrats_dossier_id", "dossier_contrats", ["dossier_id"], unique=False)
    op.create_index("ix_dossier_contrats_reference", "dossier_contrats", ["reference"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dossier_contrats_reference", table_name="dossier_contrats")
    op.drop_index("ix_dossier_contrats_dossier_id", table_name="dossier_contrats")
    op.drop_table("dossier_contrats")
