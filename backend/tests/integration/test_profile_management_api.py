"""Tests d'intégration API pour la gestion de profil US-02-04."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import application


def _unique_email() -> str:
    """Génère un email unique pour éviter les collisions en base partagée CI."""
    return f"it_profile_{uuid.uuid4().hex[:12]}@example.com"


def test_update_profile_and_change_password_end_to_end() -> None:
    """Valide le flux complet: inscription, login, update profil, changement mot de passe."""
    with TestClient(application) as client:
        email = _unique_email()
        register_response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "VeryStrongPass123!",
                "first_name": "Integration",
                "last_name": "Profile",
                "birth_date": "1990-01-01",
                "accepted_cgu": True,
                "accepted_privacy_policy": True,
            },
        )
        assert register_response.status_code == 201

        # L'email doit être confirmé avant la connexion.
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

        login_response = client.post("/api/v1/auth/login", json={"email": email, "password": "VeryStrongPass123!"})
        access_token = login_response.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]

        profile_response = client.put(
            "/api/v1/auth/profile",
            cookies={"access_token": access_token},
            json={
                "first_name": "Integr",
                "last_name": "Updated",
                "phone": "0600000000",
                "email": email,
            },
        )
        assert profile_response.status_code == 200
        assert "profil mis a jour" in profile_response.json()["message"].lower()

        password_response = client.post(
            "/api/v1/auth/change-password",
            cookies={"access_token": access_token},
            json={"old_password": "VeryStrongPass123!", "new_password": "VeryStrongPass456!"},
        )
        assert password_response.status_code == 200

        relogin_response = client.post("/api/v1/auth/login", json={"email": email, "password": "VeryStrongPass456!"})
        assert relogin_response.status_code == 200


def test_profile_email_change_requires_new_validation() -> None:
    """Un email modifié retourne un message de revalidation."""
    with TestClient(application) as client:
        old_email = _unique_email()
        new_email = _unique_email()
        client.post(
            "/api/v1/auth/register",
            json={
                "email": old_email,
                "password": "VeryStrongPass123!",
                "first_name": "Integration",
                "last_name": "Mail",
                "birth_date": "1990-01-01",
                "accepted_cgu": True,
                "accepted_privacy_policy": True,
            },
        )

        # L'email doit être confirmé avant la connexion.
        from app.db.session import SessionLocal  # noqa: WPS433
        from app.models.user import User  # noqa: WPS433
        from app.utils.client_pii import client_email_search_hash  # noqa: WPS433

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email_hash == client_email_search_hash(old_email)).first()
            assert user is not None
            user.email_verified = True
            db.commit()
        finally:
            db.close()

        login_response = client.post("/api/v1/auth/login", json={"email": old_email, "password": "VeryStrongPass123!"})
        access_token = login_response.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]

        response = client.put(
            "/api/v1/auth/profile",
            cookies={"access_token": access_token},
            json={"first_name": "Integration", "last_name": "Mail", "phone": "", "email": new_email},
        )
        assert response.status_code == 200
        assert "verification" in response.json()["message"].lower()
