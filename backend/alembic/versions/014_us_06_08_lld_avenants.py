"""US-06-08 — Avenants LLD (modifications d'options sous contrat en cours).

Revision ID: 014_us_06_08_lld_avenants
Revises: 013_us_06_contrat_en_cours
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "014_us_06_08_lld_avenants"
down_revision = "013_us_06_contrat_en_cours"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.migration_utils import has_table

    bind = op.get_bind()
    if not has_table(bind, "lld_avenants"):
        op.create_table(
            "lld_avenants",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("dossier_id", sa.Integer(), nullable=False),
            sa.Column("reference", sa.String(length=64), nullable=False),
            sa.Column("body_markdown", sa.Text(), nullable=False),
            sa.Column("selections", sa.JSON(), nullable=False),
            sa.Column("signature_token_hash", sa.String(length=64), nullable=True),
            sa.Column("signature_token_sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("signature_token_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("reference"),
            sa.UniqueConstraint("signature_token_hash"),
        )
        op.create_index(op.f("ix_lld_avenants_dossier_id"), "lld_avenants", ["dossier_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lld_avenants_dossier_id"), table_name="lld_avenants")
    op.drop_table("lld_avenants")
