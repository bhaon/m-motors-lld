"""Tests d'intégration API pour la connexion client US-02-02."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import application


def _unique_email() -> str:
    """Génère un email unique pour éviter les collisions en base partagée CI."""
    return f"it_login_{uuid.uuid4().hex[:12]}@example.com"


def test_login_then_me_end_to_end() -> None:
    """Valide le flux intégré: inscription, connexion, puis lecture de /auth/me."""
    with TestClient(application) as client:
        email = _unique_email()
        register_response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "VeryStrongPass123!",
                "first_name": "Integration",
                "last_name": "Login",
                "birth_date": "1990-01-01",
                "accepted_cgu": True,
                "accepted_privacy_policy": True,
            },
        )
        assert register_response.status_code == 201

        # Pour la connexion, l'email doit d'abord être confirmé.
        # On force l'état côté base via l'endpoint de confirmation (token simulé en DB).
        from app.db.session import SessionLocal  # noqa: WPS433
        from app.models.user import User  # noqa: WPS433
        from app.utils.client_pii import client_email_search_hash  # noqa: WPS433

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email_hash == client_email_search_hash(email)).first()
            assert user is not None
            user.email_verified = True
            db.commit()
        finally:
            db.close()

        login_response = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "VeryStrongPass123!"},
        )
        assert login_response.status_code == 200
        set_cookie_header = login_response.headers.get("set-cookie", "")
        assert "access_token" in set_cookie_header
        access_token = set_cookie_header.split("access_token=")[1].split(";")[0]

        me_response = client.get("/api/v1/auth/me", cookies={"access_token": access_token})
        assert me_response.status_code == 200
        assert me_response.json()["email"] == email


def test_login_failure_keeps_generic_error_message() -> None:
    """Vérifie qu'un échec de connexion ne révèle pas la cause exacte."""
    with TestClient(application) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "missing.user@example.com", "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Email ou mot de passe invalide."
