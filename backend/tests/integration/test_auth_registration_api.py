"""Tests d'intégration API pour l'inscription/confirmation US-02-01."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import application
from app.db.session import SessionLocal, engine
from app.db.types import is_pgcrypto_runtime_enabled
from app.models.user import User
from app.utils.client_pii import client_email_search_hash


def _unique_email() -> str:
    """Génère un email unique pour éviter les collisions en base partagée CI."""
    return f"it_user_{uuid.uuid4().hex[:12]}@example.com"


def test_register_and_confirm_email_end_to_end() -> None:
    """Valide le flux API complet : inscription puis confirmation email."""
    with TestClient(application) as client:
        email = _unique_email()
        register_response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "VeryStrongPass123!",
                "first_name": "Integration",
                "last_name": "Tester",
                "birth_date": "1990-01-01",
                "accepted_cgu": True,
                "accepted_privacy_policy": True,
            },
        )
        assert register_response.status_code == 201

        raw_token = "integration-valid-token"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        email_h = client_email_search_hash(email)
        with SessionLocal() as db:
            user = db.query(User).filter(User.email_hash == email_h).first()
            assert user is not None
            user.email_verification_token = token_hash
            user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(days=1)
            db.commit()

        confirm_response = client.get("/api/v1/auth/confirm-email", params={"token": raw_token})
        assert confirm_response.status_code == 200

        with SessionLocal() as db:
            row = db.execute(
                text(
                    "SELECT email_verified, email_verification_token FROM users WHERE email_hash = :email_hash"
                ),
                {"email_hash": email_h},
            ).mappings().first()
            assert row is not None
            assert bool(row["email_verified"]) is True
            assert row["email_verification_token"] is None


def test_personal_data_columns_are_encrypted_at_rest_on_postgres() -> None:
    """Vérifie que PostgreSQL stocke les PII sensibles en bytea (pgcrypto, AES-256)."""
    if engine.dialect.name != "postgresql" or not is_pgcrypto_runtime_enabled():
        return

    with TestClient(application) as client:
        email = _unique_email()
        email_h = client_email_search_hash(email)
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "VeryStrongPass123!",
                "first_name": "SecretFirstName",
                "last_name": "SecretLastName",
                "birth_date": "1992-08-10",
                "accepted_cgu": True,
                "accepted_privacy_policy": True,
            },
        )
        assert response.status_code == 201

    with SessionLocal() as db:
        row = db.execute(
            text(
                """
                SELECT
                  pg_typeof(first_name)::text AS first_name_type,
                  pg_typeof(last_name)::text AS last_name_type,
                  pg_typeof(email)::text AS email_type,
                  pg_typeof(birth_date)::text AS birth_date_type
                FROM users
                WHERE email_hash = :email_hash
                """
            ),
            {"email_hash": email_h},
        ).mappings().first()
        assert row is not None
        assert row["first_name_type"] == "bytea"
        assert row["last_name_type"] == "bytea"
        assert row["email_type"] == "bytea"
        assert row["birth_date_type"] == "bytea"
