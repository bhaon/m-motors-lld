"""Tests unitaires US-02-01 : inscription et confirmation email."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from app.models.user import User
from app.api.v1.endpoints import auth as auth_endpoint
from tests.conftest import create_user


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


def test_register_client_sends_verification_email(client, monkeypatch) -> None:
    """Déclenche l'envoi de l'email de vérification après création du compte."""
    sent_payload: dict[str, str] = {}

    def _fake_send_verification_email(*, to_email: str, confirmation_link: str) -> None:
        """Capture les paramètres d'envoi pour vérifier le branchement Resend."""
        sent_payload["to_email"] = to_email
        sent_payload["confirmation_link"] = confirmation_link

    monkeypatch.setattr(auth_endpoint, "send_verification_email", _fake_send_verification_email)

    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "mail.check@example.com",
            "password": "UltraSecure123!",
            "first_name": "Lina",
            "last_name": "Fournier",
            "birth_date": "1995-07-14",
            "accepted_cgu": True,
            "accepted_privacy_policy": True,
        },
    )

    assert response.status_code == 201
    assert sent_payload["to_email"] == "mail.check@example.com"
    assert "/confirm-email?token=" in sent_payload["confirmation_link"]


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


def test_register_client_requires_legal_consents(client) -> None:
    """Refuse l'inscription si les consentements CGU/RGPD ne sont pas tous acceptés."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "consent.missing@example.com",
            "password": "UltraSecure123!",
            "first_name": "Luc",
            "last_name": "Petit",
            "birth_date": "1993-06-21",
            "accepted_cgu": False,
            "accepted_privacy_policy": True,
        },
    )
    assert response.status_code == 422


def test_register_client_rejects_duplicate_email(client) -> None:
    """Refuse la création d'un second compte avec le même email."""
    payload = {
        "email": "already.used@example.com",
        "password": "UltraSecure123!",
        "first_name": "Aline",
        "last_name": "Thomas",
        "birth_date": "1991-05-12",
        "accepted_cgu": True,
        "accepted_privacy_policy": True,
    }
    first = client.post("/api/v1/auth/register", json=payload)
    second = client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201
    assert second.status_code == 409


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

    db.refresh(user)
    assert user.email_verified is True
    assert user.email_verification_token is None


def test_confirm_email_rejects_invalid_token(client) -> None:
    """Retourne 400 quand le token ne correspond à aucun utilisateur."""
    response = client.get("/api/v1/auth/confirm-email", params={"token": "invalid-token"})
    assert response.status_code == 400


def test_confirm_email_rejects_expired_token(client, db) -> None:
    """Retourne 400 quand le token existe mais a dépassé sa date d'expiration."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "expired.token@example.com",
            "password": "UltraSecure123!",
            "first_name": "Paul",
            "last_name": "Roux",
            "birth_date": "1989-04-03",
            "accepted_cgu": True,
            "accepted_privacy_policy": True,
        },
    )
    user = db.query(User).filter(User.email == "expired.token@example.com").first()
    assert user is not None
    raw_token = "expired-token-for-test"
    user.email_verification_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    user.email_verification_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    response = client.get("/api/v1/auth/confirm-email", params={"token": raw_token})
    assert response.status_code == 400


def test_login_client_success_sets_http_only_cookie(client, db) -> None:
    """Retourne 200 et pose un cookie JWT HTTP-only en cas de credentials valides."""
    user = create_user(db, email="login.ok@example.com", password="UltraSecure123!")
    assert user is not None

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login.ok@example.com", "password": "UltraSecure123!"},
    )

    assert response.status_code == 200
    assert "connexion reussie" in response.json()["message"].lower()
    cookie_header = response.headers.get("set-cookie", "")
    assert "access_token=" in cookie_header
    assert "HttpOnly" in cookie_header


def test_login_client_rejects_invalid_email_with_generic_message(client) -> None:
    """Retourne 401 avec un message générique si l'email n'existe pas."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "unknown@example.com", "password": "UltraSecure123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Email ou mot de passe invalide."


def test_login_client_rejects_invalid_password_with_generic_message(client, db) -> None:
    """Retourne 401 avec le même message si le mot de passe est invalide."""
    create_user(db, email="login.fail@example.com", password="UltraSecure123!")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login.fail@example.com", "password": "WrongPassword"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Email ou mot de passe invalide."


def test_get_current_authenticated_user_with_cookie(client, db) -> None:
    """Retourne l'utilisateur courant quand le cookie access_token est valide."""
    create_user(db, email="me@example.com", password="UltraSecure123!")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "me@example.com", "password": "UltraSecure123!"},
    )
    cookie_header = login_response.headers.get("set-cookie", "")
    access_token = cookie_header.split("access_token=")[1].split(";")[0]

    response = client.get("/api/v1/auth/me", cookies={"access_token": access_token})
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


def test_get_current_authenticated_user_without_cookie_rejected(client) -> None:
    """Retourne 401 quand le cookie d'authentification est absent."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401

