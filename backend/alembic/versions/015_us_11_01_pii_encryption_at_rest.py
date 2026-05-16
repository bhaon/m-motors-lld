"""US-11-01 : chiffrement email + date de naissance (pgcrypto AES-256), email_hash SHA-256.

Revision ID: 015_us_11_01_pii
Revises: 014_us_06_08_lld_avenants
Create Date: 2026-05-11
"""

from __future__ import annotations

import hashlib

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

from app.core.config import settings
from app.db.migration_utils import column_is_nullable, column_type_name, has_column


revision = "015_us_11_01_pii"
down_revision = "014_us_06_08_lld_avenants"
branch_labels = None
depends_on = None


def _drop_unique_on_email(bind: sa.engine.Connection) -> None:
    """Supprime contraintes UNIQUE portant uniquement sur la colonne email."""
    inspector = sa.inspect(bind)
    for uc in list(inspector.get_unique_constraints("users")):
        if tuple(uc.get("column_names") or ()) == ("email",):
            name = uc.get("name")
            if not name:
                continue
            op.drop_constraint(name, "users", type_="unique")


def _drop_nonunique_index_on_email(bind: sa.engine.Connection) -> None:
    """Supprime les index non uniques dédiés à email (ex. ix_users_email)."""
    inspector = sa.inspect(bind)
    for ix in list(inspector.get_indexes("users")):
        if tuple(ix.get("column_names") or ()) == ("email",) and not ix.get("unique", False):
            name = ix.get("name")
            if not name:
                continue
            op.drop_index(name, table_name="users")


def _backfill_email_hash_sqlite(conn: sa.engine.Connection) -> None:
    """Remplit email_hash pour SQLite (pas d'extension digest)."""
    rows = conn.execute(text("SELECT id, email FROM users WHERE email_hash IS NULL")).mappings().all()
    for row in rows:
        raw = row["email"]
        if raw is None:
            continue
        h = hashlib.sha256(str(raw).strip().lower().encode("utf-8")).hexdigest()
        conn.execute(text("UPDATE users SET email_hash = :h WHERE id = :id"), {"h": h, "id": row["id"]})


def upgrade() -> None:
    """Ajoute email_hash, chiffre email et birth_date (PostgreSQL), index d'unicité partiel."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    encryption_key = settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY

    if not has_column(bind, table_name="users", column_name="email_hash"):
        op.add_column("users", sa.Column("email_hash", sa.String(length=64), nullable=True))

    if is_postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        email_type = column_type_name(bind, table_name="users", column_name="email")
        if email_type == "bytea":
            op.execute(
                sa.text(
                    """
                    UPDATE users
                    SET email_hash = encode(
                        digest(lower(trim(pgp_sym_decrypt(email, :encryption_key)::text)), 'sha256'),
                        'hex'
                    )
                    WHERE email_hash IS NULL
                    """
                ).bindparams(encryption_key=encryption_key)
            )
        else:
            op.execute(
                sa.text(
                    """
                    UPDATE users
                    SET email_hash = encode(digest(lower(trim(email::text)), 'sha256'), 'hex')
                    WHERE email_hash IS NULL
                    """
                )
            )
    else:
        _backfill_email_hash_sqlite(bind)

    _drop_unique_on_email(bind)
    _drop_nonunique_index_on_email(bind)

    if is_postgres:
        email_type = column_type_name(bind, table_name="users", column_name="email")
        if email_type != "bytea":
            op.execute(
                sa.text(
                    """
                    ALTER TABLE users
                    ALTER COLUMN email TYPE bytea
                    USING pgp_sym_encrypt(email::text, :encryption_key, 'cipher-algo=aes256')
                    """
                ).bindparams(encryption_key=encryption_key)
            )
        birth_type = column_type_name(bind, table_name="users", column_name="birth_date")
        if birth_type != "bytea":
            op.execute(
                sa.text(
                    """
                    ALTER TABLE users
                    ALTER COLUMN birth_date TYPE bytea
                    USING pgp_sym_encrypt(to_char(birth_date, 'YYYY-MM-DD'), :encryption_key, 'cipher-algo=aes256')
                    """
                ).bindparams(encryption_key=encryption_key)
            )

    remaining = bind.execute(text("SELECT COUNT(*) AS n FROM users WHERE email_hash IS NULL")).scalar()
    if (remaining or 0) > 0:
        raise RuntimeError("Impossible de finaliser US-11-01 : email_hash encore NULL sur certaines lignes.")

    if column_is_nullable(bind, table_name="users", column_name="email_hash"):
        with op.batch_alter_table("users") as batch:
            batch.alter_column("email_hash", existing_type=sa.String(length=64), nullable=False)

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_hash_active
        ON users (email_hash)
        WHERE deleted_at IS NULL
        """
    )


def downgrade() -> None:
    """Retire l'index partiel et remet email / birth_date en clair (PostgreSQL)."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    encryption_key = settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY

    op.execute("DROP INDEX IF EXISTS uq_users_email_hash_active")

    with op.batch_alter_table("users") as batch:
        batch.alter_column("email_hash", existing_type=sa.String(length=64), nullable=True)

    if is_postgres:
        email_type = column_type_name(bind, table_name="users", column_name="email")
        if email_type == "bytea":
            op.execute(
                sa.text(
                    """
                    ALTER TABLE users
                    ALTER COLUMN email TYPE varchar(255)
                    USING pgp_sym_decrypt(email, :encryption_key)::text
                    """
                ).bindparams(encryption_key=encryption_key)
            )
        birth_type = column_type_name(bind, table_name="users", column_name="birth_date")
        if birth_type == "bytea":
            op.execute(
                sa.text(
                    """
                    ALTER TABLE users
                    ALTER COLUMN birth_date TYPE date
                    USING to_date(pgp_sym_decrypt(birth_date, :encryption_key), 'YYYY-MM-DD')
                    """
                ).bindparams(encryption_key=encryption_key)
            )

    op.drop_column("users", "email_hash")

    op.create_unique_constraint("users_email_key", "users", ["email"])
