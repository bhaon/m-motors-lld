"""US-07-03 — Catalogue LLD administrable, feature flags et historique des tarifs.

Revision ID: 008_us_07_03
Revises: 007_us_07_01
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "008_us_07_03"
down_revision = "007_us_07_01"
branch_labels = None
depends_on = None


_FLAG_SUFFIX = ".enabled"
_DEFAULT_TS = sa.text("(CURRENT_TIMESTAMP)")


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("value_bool", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_DEFAULT_TS, nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "lld_option_catalog",
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )
    op.create_table(
        "lld_option_price_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_code", sa.String(length=40), nullable=False),
        sa.Column("price_ht", sa.Numeric(10, 2), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), server_default=_DEFAULT_TS, nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["option_code"], ["lld_option_catalog.code"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_lld_option_price_history_option_code"),
        "lld_option_price_history",
        ["option_code"],
        unique=False,
    )

    catalog_rows = [
        {
            "code": "assurance",
            "label": "Assurance tous risques",
            "description": (
                "Couverture dommages, vol et incendie pour votre véhicule en LLD."
            ),
        },
        {
            "code": "assistance",
            "label": "Assistance & dépannage",
            "description": (
                "Dépannage sur site, véhicule de remplacement selon conditions générales."
            ),
        },
        {
            "code": "entretien",
            "label": "Entretien & révisions",
            "description": (
                "Révisions périodiques, filtres et fluides prévus au carnet constructeur."
            ),
        },
        {
            "code": "controle_technique",
            "label": "Contrôle technique",
            "description": (
                "Prise en charge du passage au contrôle technique obligatoire pendant la durée du contrat."
            ),
        },
    ]
    op.bulk_insert(
        sa.table(
            "lld_option_catalog",
            sa.column("code", sa.String),
            sa.column("label", sa.String),
            sa.column("description", sa.Text),
        ),
        catalog_rows,
    )

    prices = [
        {"option_code": "assurance", "price_ht": 39.0},
        {"option_code": "assistance", "price_ht": 9.0},
        {"option_code": "entretien", "price_ht": 29.0},
        {"option_code": "controle_technique", "price_ht": 5.0},
    ]
    op.bulk_insert(
        sa.table(
            "lld_option_price_history",
            sa.column("option_code", sa.String),
            sa.column("price_ht", sa.Numeric(10, 2)),
            sa.column("created_by_user_id", sa.Integer),
        ),
        [{**p, "created_by_user_id": None} for p in prices],
    )

    flags = [{"key": f"lld_option.{r['code']}{_FLAG_SUFFIX}", "value_bool": True} for r in catalog_rows]
    op.bulk_insert(
        sa.table(
            "feature_flags",
            sa.column("key", sa.String),
            sa.column("value_bool", sa.Boolean),
        ),
        flags,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lld_option_price_history_option_code"), table_name="lld_option_price_history")
    op.drop_table("lld_option_price_history")
    op.drop_table("lld_option_catalog")
    op.drop_table("feature_flags")
