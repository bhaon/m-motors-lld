"""US-02-03 : réinitialisation mot de passe par email.

Revision ID: 003_us_02_03
Revises: 002_us_02_01
Create Date: 2026-05-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "003_us_02_03"
down_revision = "002_us_02_01"
branch_labels = None
depends_on = None


def _has_column(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> bool:
    """Retourne True si la colonne existe déjà (migration idempotente)."""
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    """Ajoute les colonnes de token de réinitialisation de mot de passe."""
    bind = op.get_bind()
    with op.batch_alter_table("users") as batch:
        if not _has_column(bind, table_name="users", column_name="password_reset_token"):
            batch.add_column(sa.Column("password_reset_token", sa.String(length=255), nullable=True))
        if not _has_column(bind, table_name="users", column_name="password_reset_sent_at"):
            batch.add_column(sa.Column("password_reset_sent_at", sa.DateTime(timezone=True), nullable=True))
        if not _has_column(bind, table_name="users", column_name="password_reset_expires_at"):
            batch.add_column(sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True))
        # Peut déjà exister si le schéma provient directement des modèles.
        try:
            batch.create_unique_constraint("uq_users_password_reset_token", ["password_reset_token"])
        except Exception:
            pass


def downgrade() -> None:
    """Retire les colonnes de token de réinitialisation de mot de passe."""
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_password_reset_token", type_="unique")
        batch.drop_column("password_reset_expires_at")
        batch.drop_column("password_reset_sent_at")
        batch.drop_column("password_reset_token")
