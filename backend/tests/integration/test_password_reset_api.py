"""Tests d'intégration API pour la réinitialisation de mot de passe US-02-03."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import application
from app.models.user import User


def _unique_email() -> str:
    """Génère un email unique pour éviter les collisions en base partagée CI."""
    return f"it_reset_{uuid.uuid4().hex[:12]}@example.com"


def test_forgot_then_reset_password_end_to_end() -> None:
    """Valide le flux complet : demande reset, reset effectif, ancien mot de passe invalide."""
    with TestClient(application) as client:
        email = _unique_email()
        register_response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "VeryStrongPass123!",
                "first_name": "Integration",
                "last_name": "Reset",
                "birth_date": "1990-01-01",
                "accepted_cgu": True,
                "accepted_privacy_policy": True,
            },
        )
        assert register_response.status_code == 201

        # Le login est protégé par email_verified, on le force pour valider la suite.
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == email).first()
            assert user is not None
            user.email_verified = True
            db.commit()
        finally:
            db.close()

        forgot_response = client.post("/api/v1/auth/forgot-password", json={"email": email})
        assert forgot_response.status_code == 200

        raw_token = "integration-reset-token"
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == email).first()
            assert user is not None
            user.password_reset_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            user.password_reset_sent_at = datetime.now(timezone.utc)
            user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            db.commit()
        finally:
            db.close()

        reset_response = client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "VeryStrongPass456!"},
        )
        assert reset_response.status_code == 200

        old_login = client.post("/api/v1/auth/login", json={"email": email, "password": "VeryStrongPass123!"})
        assert old_login.status_code == 401

        new_login = client.post("/api/v1/auth/login", json={"email": email, "password": "VeryStrongPass456!"})
        assert new_login.status_code == 200
