"""US-07-01 — Options LLD personnalisables (table ``options_lld``).

Revision ID: 007_us_07_01
Revises: 006_us_11_04
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "007_us_07_01"
down_revision = "006_us_11_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "options_lld",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dossier_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        # PostgreSQL refuse DEFAULT 0 sur une colonne BOOLEAN ; SQLite accepte false également.
        sa.Column("selected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("surcout_mensuel_ht", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["dossier_id"], ["dossiers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dossier_id", "code", name="uq_options_lld_dossier_code"),
    )
    op.create_index(op.f("ix_options_lld_dossier_id"), "options_lld", ["dossier_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_options_lld_dossier_id"), table_name="options_lld")
    op.drop_table("options_lld")
