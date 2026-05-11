"""Types SQLAlchemy personnalisés (ex: chiffrement pgcrypto)."""

from __future__ import annotations

import os

from datetime import date

from sqlalchemy import Date, String, TypeDecorator, cast, func, literal, type_coerce
from sqlalchemy.dialects.postgresql import BYTEA
from app.core.config import settings


def is_pgcrypto_runtime_enabled() -> bool:
    """Indique si le chiffrement pgcrypto doit être appliqué côté ORM."""
    # En environnement de tests CI, on désactive la couche ORM pgcrypto
    # pour éviter les dépendances implicites (extension/DDL) hors migrations.
    env = (os.getenv("ENVIRONMENT") or os.getenv("ENV") or "").strip().lower()
    return settings.database_url.startswith("postgresql") and env != "test"


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
        if dialect.name == "postgresql" and is_pgcrypto_runtime_enabled():
            return dialect.type_descriptor(BYTEA())
        return dialect.type_descriptor(String())

    def bind_expression(self, bindvalue):
        """Applique pgp_sym_encrypt à l'écriture sur PostgreSQL."""
        if not is_pgcrypto_runtime_enabled():
            return bindvalue
        # Force le paramètre en texte pour éviter l'adaptation BYTEA d'un str.
        plaintext_value = type_coerce(bindvalue, String())
        return func.pgp_sym_encrypt(
            plaintext_value,
            literal(self._encryption_key),
            literal("cipher-algo=aes256"),
        )

    def column_expression(self, column):
        """Applique pgp_sym_decrypt à la lecture sur PostgreSQL."""
        if not is_pgcrypto_runtime_enabled():
            return column
        return func.pgp_sym_decrypt(column, literal(self._encryption_key)).cast(String())


class PgcryptoEncryptedDate(TypeDecorator[date]):
    """Chiffre/déchiffre une date (stockée comme texte ISO « YYYY-MM-DD ») via pgcrypto côté PostgreSQL."""

    impl = Date
    cache_ok = True

    def __init__(self, encryption_key: str, *args, **kwargs) -> None:
        """Initialise le type avec la clé de chiffrement applicative."""
        super().__init__(*args, **kwargs)
        self._encryption_key = encryption_key

    def load_dialect_impl(self, dialect):
        """Utilise BYTEA sur PostgreSQL, type date ailleurs (tests SQLite)."""
        if dialect.name == "postgresql" and is_pgcrypto_runtime_enabled():
            return dialect.type_descriptor(BYTEA())
        return dialect.type_descriptor(Date())

    def bind_expression(self, bindvalue):
        """Chiffre la date sous forme de chaîne ISO à l'écriture sur PostgreSQL."""
        if not is_pgcrypto_runtime_enabled():
            return bindvalue
        plaintext = func.to_char(type_coerce(bindvalue, Date()), "YYYY-MM-DD")
        return func.pgp_sym_encrypt(
            plaintext,
            literal(self._encryption_key),
            literal("cipher-algo=aes256"),
        )

    def column_expression(self, column):
        """Déchiffre et recaste en date à la lecture sur PostgreSQL."""
        if not is_pgcrypto_runtime_enabled():
            return column
        decrypted = func.pgp_sym_decrypt(column, literal(self._encryption_key))
        return cast(cast(decrypted, String()), Date())
