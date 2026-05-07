"""Tests unitaires des types SQLAlchemy personnalisés."""

from __future__ import annotations

from sqlalchemy import bindparam
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.sqltypes import String

from app.db.types import PgcryptoEncryptedText


def test_bind_expression_coerce_le_plaintext_en_texte(monkeypatch) -> None:
    """Vérifie que pgp_sym_encrypt reçoit une valeur castée en texte."""
    monkeypatch.setattr("app.db.types.is_pgcrypto_runtime_enabled", lambda: True)

    encrypted = PgcryptoEncryptedText("test-key")
    expression = encrypted.bind_expression(bindparam("pii_value"))
    sql = str(expression.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": False}))
    encrypted_argument = list(expression.clauses)[0]

    assert "pgp_sym_encrypt" in sql
    assert isinstance(encrypted_argument.type, String)
