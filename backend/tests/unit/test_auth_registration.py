"""Tests unitaires US-02-01 : inscription et confirmation email."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from app.core.security import verify_password
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


def test_logout_client_deletes_access_token_cookie(client, db) -> None:
    """Supprime le cookie access_token pour déconnecter le client."""
    create_user(db, email="logout.ok@example.com", password="UltraSecure123!")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "logout.ok@example.com", "password": "UltraSecure123!"},
    )
    assert login_response.status_code == 200

    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 200
    assert "deconnexion" in response.json()["message"].lower()

    cookie_header = response.headers.get("set-cookie", "")
    assert "access_token=" in cookie_header
    assert "Max-Age=0" in cookie_header


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


def test_update_profile_updates_names_and_phone(client, db) -> None:
    """Met à jour prénom/nom/téléphone et retourne une confirmation visuelle."""
    create_user(db, email="profile.edit@example.com", password="UltraSecure123!")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "profile.edit@example.com", "password": "UltraSecure123!"},
    )
    access_token = login_response.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]

    response = client.put(
        "/api/v1/auth/profile",
        cookies={"access_token": access_token},
        json={
            "first_name": "Alicia",
            "last_name": "Martin",
            "phone": "0102030405",
            "email": "profile.edit@example.com",
        },
    )
    assert response.status_code == 200
    assert "profil mis a jour" in response.json()["message"].lower()

    me_response = client.get("/api/v1/auth/me", cookies={"access_token": access_token})
    assert me_response.status_code == 200
    assert me_response.json()["first_name"] == "Alicia"
    assert me_response.json()["phone"] == "0102030405"


def test_update_profile_email_change_requires_revalidation(client, db, monkeypatch) -> None:
    """Un changement d'email déclenche un nouveau lien de validation."""
    sent_payload: dict[str, str] = {}

    def _fake_send_verification_email(*, to_email: str, confirmation_link: str) -> None:
        sent_payload["to_email"] = to_email
        sent_payload["confirmation_link"] = confirmation_link

    monkeypatch.setattr(auth_endpoint, "send_verification_email", _fake_send_verification_email)
    create_user(db, email="old.mail@example.com", password="UltraSecure123!")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "old.mail@example.com", "password": "UltraSecure123!"},
    )
    access_token = login_response.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]

    response = client.put(
        "/api/v1/auth/profile",
        cookies={"access_token": access_token},
        json={
            "first_name": "Alice",
            "last_name": "Durand",
            "phone": "",
            "email": "new.mail@example.com",
        },
    )
    assert response.status_code == 200
    assert "verification" in response.json()["message"].lower()
    assert sent_payload["to_email"] == "new.mail@example.com"
    assert "/confirm-email?token=" in sent_payload["confirmation_link"]


def test_change_password_requires_old_password(client, db) -> None:
    """Refuse le changement si l'ancien mot de passe est incorrect."""
    create_user(db, email="pwd.user@example.com", password="UltraSecure123!")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "pwd.user@example.com", "password": "UltraSecure123!"},
    )
    access_token = login_response.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]

    response = client.post(
        "/api/v1/auth/change-password",
        cookies={"access_token": access_token},
        json={"old_password": "WrongPassword", "new_password": "NewStrongPassword123!"},
    )
    assert response.status_code == 400
    assert "ancien mot de passe invalide" in response.json()["detail"].lower()


def test_change_password_success(client, db) -> None:
    """Met à jour le mot de passe quand l'ancien est valide."""
    create_user(db, email="pwd.ok@example.com", password="UltraSecure123!")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "pwd.ok@example.com", "password": "UltraSecure123!"},
    )
    access_token = login_response.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]

    response = client.post(
        "/api/v1/auth/change-password",
        cookies={"access_token": access_token},
        json={"old_password": "UltraSecure123!", "new_password": "NewStrongPassword123!"},
    )
    assert response.status_code == 200

    relogin_response = client.post(
        "/api/v1/auth/login",
        json={"email": "pwd.ok@example.com", "password": "NewStrongPassword123!"},
    )
    assert relogin_response.status_code == 200


def test_forgot_password_issues_reset_token_and_sends_email(client, db, monkeypatch) -> None:
    """Déclenche un token de reset (1h) et envoie le lien de réinitialisation."""
    sent_payload: dict[str, str] = {}

    def _fake_send_password_reset_email(*, to_email: str, reset_link: str) -> None:
        sent_payload["to_email"] = to_email
        sent_payload["reset_link"] = reset_link

    monkeypatch.setattr(auth_endpoint, "send_password_reset_email", _fake_send_password_reset_email)
    create_user(db, email="forgot@example.com", password="UltraSecure123!")

    response = client.post("/api/v1/auth/forgot-password", json={"email": "forgot@example.com"})
    assert response.status_code == 200
    assert "reinitialisation" in response.json()["message"].lower()
    assert sent_payload["to_email"] == "forgot@example.com"
    assert "/reset-password?token=" in sent_payload["reset_link"]

    user = db.query(User).filter(User.email == "forgot@example.com").first()
    assert user is not None
    assert user.password_reset_token is not None
    assert user.password_reset_expires_at is not None


def test_forgot_password_for_unknown_email_stays_generic(client, monkeypatch) -> None:
    """Ne révèle pas si l'email existe et n'envoie pas d'email."""
    called = {"value": False}

    def _fake_send_password_reset_email(*, to_email: str, reset_link: str) -> None:
        called["value"] = True

    monkeypatch.setattr(auth_endpoint, "send_password_reset_email", _fake_send_password_reset_email)

    response = client.post("/api/v1/auth/forgot-password", json={"email": "missing@example.com"})
    assert response.status_code == 200
    assert "si un compte existe" in response.json()["message"].lower()
    assert called["value"] is False


def test_reset_password_success_invalidates_old_password(client, db) -> None:
    """Réinitialise le mot de passe avec token valide et invalide l'ancien immédiatement."""
    user = create_user(db, email="reset.ok@example.com", password="OldStrong123!")
    raw_token = "valid-reset-token"
    user.password_reset_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    user.password_reset_sent_at = datetime.now(timezone.utc)
    user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewStrong123!@"},
    )
    assert response.status_code == 200
    assert "reinitialise" in response.json()["message"].lower()

    db.refresh(user)
    assert user.password_reset_token is None
    assert verify_password("OldStrong123!", user.hashed_password) is False
    assert verify_password("NewStrong123!@", user.hashed_password) is True


def test_reset_password_rejects_expired_token(client, db) -> None:
    """Refuse la réinitialisation si le token a expiré."""
    user = create_user(db, email="reset.expired@example.com", password="OldStrong123!")
    raw_token = "expired-reset-token"
    user.password_reset_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    user.password_reset_sent_at = datetime.now(timezone.utc) - timedelta(hours=2)
    user.password_reset_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewStrong123!@"},
    )
    assert response.status_code == 400
    assert "expire" in response.json()["detail"].lower()

