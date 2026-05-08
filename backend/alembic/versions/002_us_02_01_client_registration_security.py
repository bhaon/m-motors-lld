"""US-02-01 : inscription client securisee + consentements + pgcrypto.

Revision ID: 002_us_02_01
Revises: 001_initial
Create Date: 2026-05-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from app.core.config import settings


revision = "002_us_02_01"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def _has_column(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> bool:
    """
    Retourne True si la colonne existe déjà.

    Contexte: la révision `001_initial` crée les tables via `Base.metadata.create_all()`, ce qui peut
    inclure des colonnes introduites par des révisions ultérieures selon l'état des modèles au moment
    de l'exécution. Cette garde rend la migration idempotente sur une base déjà partiellement alignée.
    """
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    """Ajoute les champs d'inscription et chiffre les donnees personnelles."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    encryption_key = settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY

    if is_postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    with op.batch_alter_table("users") as batch:
        if not _has_column(bind, table_name="users", column_name="birth_date"):
            batch.add_column(sa.Column("birth_date", sa.Date(), nullable=True))
        if not _has_column(bind, table_name="users", column_name="cgu_accepted_at"):
            batch.add_column(sa.Column("cgu_accepted_at", sa.DateTime(timezone=True), nullable=True))
        if not _has_column(bind, table_name="users", column_name="privacy_accepted_at"):
            batch.add_column(sa.Column("privacy_accepted_at", sa.DateTime(timezone=True), nullable=True))
        if not _has_column(bind, table_name="users", column_name="email_verification_token"):
            batch.add_column(sa.Column("email_verification_token", sa.String(length=255), nullable=True))
        if not _has_column(bind, table_name="users", column_name="email_verification_sent_at"):
            batch.add_column(sa.Column("email_verification_sent_at", sa.DateTime(timezone=True), nullable=True))
        if not _has_column(bind, table_name="users", column_name="email_verification_expires_at"):
            batch.add_column(sa.Column("email_verification_expires_at", sa.DateTime(timezone=True), nullable=True))
        # La contrainte peut exister si le schéma a été créé depuis les modèles actuels.
        try:
            batch.create_unique_constraint("uq_users_email_verification_token", ["email_verification_token"])
        except Exception:
            pass

    if is_postgres:
        op.execute(
            """
            UPDATE users
            SET birth_date = DATE '1970-01-01',
                cgu_accepted_at = COALESCE(created_at, NOW()),
                privacy_accepted_at = COALESCE(created_at, NOW())
            """
        )
        op.execute(
            sa.text(
                """
            ALTER TABLE users
            ALTER COLUMN first_name TYPE bytea
            USING pgp_sym_encrypt(first_name, :encryption_key, 'cipher-algo=aes256')
            """
            ).bindparams(encryption_key=encryption_key)
        )
        op.execute(
            sa.text(
                """
            ALTER TABLE users
            ALTER COLUMN last_name TYPE bytea
            USING pgp_sym_encrypt(last_name, :encryption_key, 'cipher-algo=aes256')
            """
            ).bindparams(encryption_key=encryption_key)
        )
    else:
        op.execute(
            """
            UPDATE users
            SET birth_date = DATE('1970-01-01'),
                cgu_accepted_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                privacy_accepted_at = COALESCE(created_at, CURRENT_TIMESTAMP)
            """
        )

    with op.batch_alter_table("users") as batch:
        if _has_column(bind, table_name="users", column_name="birth_date"):
            batch.alter_column("birth_date", nullable=False)
        if _has_column(bind, table_name="users", column_name="cgu_accepted_at"):
            batch.alter_column("cgu_accepted_at", nullable=False)
        if _has_column(bind, table_name="users", column_name="privacy_accepted_at"):
            batch.alter_column("privacy_accepted_at", nullable=False)


def downgrade() -> None:
    """Retire les champs US-02-01 et remet les colonnes en clair."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    encryption_key = settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY

    if is_postgres:
        op.execute(
            sa.text(
                """
            ALTER TABLE users
            ALTER COLUMN first_name TYPE varchar(100)
            USING pgp_sym_decrypt(first_name, :encryption_key)
            """
            ).bindparams(encryption_key=encryption_key)
        )
        op.execute(
            sa.text(
                """
            ALTER TABLE users
            ALTER COLUMN last_name TYPE varchar(100)
            USING pgp_sym_decrypt(last_name, :encryption_key)
            """
            ).bindparams(encryption_key=encryption_key)
        )

    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_email_verification_token", type_="unique")
        batch.drop_column("email_verification_expires_at")
        batch.drop_column("email_verification_sent_at")
        batch.drop_column("email_verification_token")
        batch.drop_column("privacy_accepted_at")
        batch.drop_column("cgu_accepted_at")
        batch.drop_column("birth_date")
