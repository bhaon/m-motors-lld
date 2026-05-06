"""Types SQLAlchemy personnalisés (ex: chiffrement pgcrypto)."""

from __future__ import annotations

from sqlalchemy import String, TypeDecorator, func, literal
from sqlalchemy.dialects.postgresql import BYTEA
from app.core.config import settings


class PgcryptoEncryptedText(TypeDecorator[str]):
    """Chiffre/déchiffre un texte en base via pgcrypto côté PostgreSQL."""

    impl = String
    cache_ok = True

    def __init__(self, encryption_key: str, *args, **kwargs) -> None:
        """Initialise le type avec la clé de chiffrement applicative."""
        super().__init__(*args, **kwargs)
        self._encryption_key = encryption_key

    def load_dialect_impl(self, dialect):
        """Utilise BYTEA sur PostgreSQL, texte simple ailleurs (tests SQLite)."""
        if dialect.name == "postgresql":
            return dialect.type_descriptor(BYTEA())
        return dialect.type_descriptor(String())

    def bind_expression(self, bindvalue):
        """Applique pgp_sym_encrypt à l'écriture sur PostgreSQL."""
        if not settings.database_url.startswith("postgresql"):
            return bindvalue
        return func.pgp_sym_encrypt(
            bindvalue,
            literal(self._encryption_key),
            literal("cipher-algo=aes256"),
        )

    def column_expression(self, column):
        """Applique pgp_sym_decrypt à la lecture sur PostgreSQL."""
        if not settings.database_url.startswith("postgresql"):
            return column
        return func.pgp_sym_decrypt(column, literal(self._encryption_key)).cast(String())
