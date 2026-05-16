"""US-11-04 — Audit trail : table immuable des mutations sensibles.

Revision ID: 006_us_11_04
Revises: 005_us_04_04
Create Date: 2026-05-08

Rétention minimum 5 ans (voir docs/US-11-04-audit-trail.md).

Pour PostgreSQL en production, ajouter après la migration :
    CREATE RULE no_update_audit AS ON UPDATE TO audit_trail DO INSTEAD NOTHING;
    CREATE RULE no_delete_audit AS ON DELETE TO audit_trail DO INSTEAD NOTHING;
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "006_us_11_04"
down_revision = "005_us_04_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.migration_utils import has_table

    bind = op.get_bind()
    # Garde idempotente : migration 001 peut avoir déjà créé la table via create_all
    if not has_table(bind, "audit_trail"):
        op.create_table(
            "audit_trail",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column("entity_type", sa.String(64), nullable=False),
            sa.Column("entity_id", sa.Integer(), nullable=False),
            sa.Column("operator_id", sa.Integer(), nullable=False),
            sa.Column("operator_email", sa.String(255), nullable=False),
            sa.Column("operator_role", sa.String(32), nullable=False),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("before_state", sa.JSON(), nullable=True),
            sa.Column("after_state", sa.JSON(), nullable=False),
        )
        op.create_index("ix_audit_trail_action", "audit_trail", ["action"])
        op.create_index("ix_audit_trail_entity_type", "audit_trail", ["entity_type"])
        op.create_index("ix_audit_trail_entity_id", "audit_trail", ["entity_id"])
        op.create_index("ix_audit_trail_operator_id", "audit_trail", ["operator_id"])
        op.create_index("ix_audit_trail_created_at", "audit_trail", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_trail_created_at", "audit_trail")
    op.drop_index("ix_audit_trail_operator_id", "audit_trail")
    op.drop_index("ix_audit_trail_entity_id", "audit_trail")
    op.drop_index("ix_audit_trail_entity_type", "audit_trail")
    op.drop_index("ix_audit_trail_action", "audit_trail")
    op.drop_table("audit_trail")
