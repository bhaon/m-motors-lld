"""Tests unitaires US-02-01 : inscription et confirmation email."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from app.models.user import User


def test_register_client_success(client, db) -> None:
    """Inscrit un client avec consentements obligatoires et mot de passe conforme."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new.client@example.com",
            "password": "UltraSecure123!",
            "first_name": "Alice",
            "last_name": "Martin",
            "birth_date": "1995-07-14",
            "accepted_cgu": True,
            "accepted_privacy_policy": True,
        },
    )
    assert response.status_code == 201
    assert "confirmation" in response.json()["message"].lower()

    user = db.query(User).filter(User.email == "new.client@example.com").first()
    assert user is not None
    assert user.email_verified is False
    assert user.email_verification_token is not None


def test_register_client_rejects_weak_password(client) -> None:
    """Refuse un mot de passe qui ne respecte pas la politique de sécurité."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@example.com",
            "password": "weakpass",
            "first_name": "Jean",
            "last_name": "Dupont",
            "birth_date": "1995-07-14",
            "accepted_cgu": True,
            "accepted_privacy_policy": True,
        },
    )
    assert response.status_code == 422


def test_confirm_email_success(client, db) -> None:
    """Confirme l'email avec un token valide."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "to.confirm@example.com",
            "password": "UltraSecure123!",
            "first_name": "Nina",
            "last_name": "Durand",
            "birth_date": "1992-03-01",
            "accepted_cgu": True,
            "accepted_privacy_policy": True,
        },
    )
    user = db.query(User).filter(User.email == "to.confirm@example.com").first()
    assert user is not None
    raw_token = "valid-token-for-test"
    user.email_verification_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    response = client.get("/api/v1/auth/confirm-email", params={"token": raw_token})
    assert response.status_code == 200
    assert "confirme" in response.json()["message"].lower()

