"""Tests unitaires US-11-01 : hachage email pour recherche et cohérence modèle."""

from __future__ import annotations

import hashlib

from datetime import date, datetime, timezone

from app.models.user import RoleEnum, User
from app.utils.client_pii import client_email_search_hash, normalized_client_email


def test_client_email_search_hash_is_sha256_hex_of_normalized_email() -> None:
    """L'empreinte correspond au SHA-256 hex de l'email normalisé (trim + minuscules)."""
    email = "  User@Example.COM  "
    expected = hashlib.sha256(b"user@example.com").hexdigest()
    assert client_email_search_hash(email) == expected


def test_normalized_client_email_strips_and_lowercases() -> None:
    """La normalisation retire les espaces et passe en minuscules."""
    assert normalized_client_email("  A@B.C  ") == "a@b.c"


def test_user_assigning_email_updates_email_hash() -> None:
    """Le validateur maintient email_hash aligné sur l'email applicatif."""
    now = datetime.now(timezone.utc)
    u = User(
        email="Client@Example.com",
        hashed_password="x",
        first_name="A",
        last_name="B",
        birth_date=date(1990, 1, 1),
        role=RoleEnum.client,
        cgu_accepted_at=now,
        privacy_accepted_at=now,
    )
    assert u.email_hash == client_email_search_hash("client@example.com")
