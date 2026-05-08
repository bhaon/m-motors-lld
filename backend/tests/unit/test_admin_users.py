"""Tests de la gestion des utilisateurs via le back-office administrateur."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import RoleEnum, User
from tests.conftest import create_user


def _cookie(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _admin_headers(client: TestClient, db: Session) -> dict[str, str]:
    admin = create_user(db, role=RoleEnum.admin, email="admin.mgmt@example.com")
    return _cookie(client, email=admin.email, password="SecretMotDePasse1!")


# ── GET /admin/users ─────────────────────────────────────────────────────────

def test_list_users_includes_name_fields(client: TestClient, db: Session) -> None:
    """GET /admin/users retourne first_name et last_name pour chaque utilisateur."""
    headers = _admin_headers(client, db)
    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 200
    users = response.json()
    assert len(users) >= 1
    user = users[0]
    assert "first_name" in user
    assert "last_name" in user
    assert "email" in user
    assert "role" in user


# ── POST /admin/users ─────────────────────────────────────────────────────────

def test_admin_can_create_superviseur(client: TestClient, db: Session) -> None:
    """POST /admin/users crée un compte superviseur (201)."""
    headers = _admin_headers(client, db)

    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "nouveau.sup@example.com",
            "password": "Sup3rS3cur!",
            "first_name": "Sophie",
            "last_name": "Martin",
            "role": "superviseur",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "nouveau.sup@example.com"
    assert body["role"] == "superviseur"
    assert "message" in body

    created = db.query(User).filter(User.email == "nouveau.sup@example.com").first()
    assert created is not None
    assert created.role == RoleEnum.superviseur
    assert created.email_verified is True


def test_admin_can_create_admin(client: TestClient, db: Session) -> None:
    """POST /admin/users crée un compte admin (201)."""
    headers = _admin_headers(client, db)

    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "nouvel.admin@example.com",
            "password": "Adm1n!Secur3",
            "first_name": "Marc",
            "last_name": "Dupont",
            "role": "admin",
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["role"] == "admin"


def test_admin_can_create_gestionnaire(client: TestClient, db: Session) -> None:
    """POST /admin/users crée un compte gestionnaire (201)."""
    headers = _admin_headers(client, db)

    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "nouveau.gest@example.com",
            "password": "Gest!0nSec",
            "first_name": "Jean",
            "last_name": "Bernard",
            "role": "gestionnaire",
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["role"] == "gestionnaire"


def test_create_user_duplicate_email_rejected(client: TestClient, db: Session) -> None:
    """POST /admin/users retourne 409 si l'email est déjà utilisé."""
    existing = create_user(db, email="duplicate@example.com")
    headers = _admin_headers(client, db)

    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": existing.email,
            "password": "Sup3rS3cur!",
            "first_name": "Test",
            "last_name": "Dup",
            "role": "superviseur",
        },
        headers=headers,
    )

    assert response.status_code == 409
    assert "existe déjà" in response.json()["detail"]


def test_create_user_weak_password_rejected(client: TestClient, db: Session) -> None:
    """POST /admin/users retourne 422 si le mot de passe ne satisfait pas les critères."""
    headers = _admin_headers(client, db)

    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "weak.pass@example.com",
            "password": "tooweakpwd",
            "first_name": "Test",
            "last_name": "Weak",
            "role": "superviseur",
        },
        headers=headers,
    )

    assert response.status_code == 422


def test_create_user_missing_fields_rejected(client: TestClient, db: Session) -> None:
    """POST /admin/users retourne 422 si des champs obligatoires manquent."""
    headers = _admin_headers(client, db)

    response = client.post(
        "/api/v1/admin/users",
        json={"email": "missing@example.com"},
        headers=headers,
    )

    assert response.status_code == 422


def test_non_admin_cannot_create_user(client: TestClient, db: Session) -> None:
    """POST /admin/users retourne 403 pour un gestionnaire."""
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.nocreate@example.com")
    headers = _cookie(client, email=gest.email, password="SecretMotDePasse1!")

    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "unauthorized@example.com",
            "password": "Sup3rS3cur!",
            "first_name": "X",
            "last_name": "Y",
            "role": "superviseur",
        },
        headers=headers,
    )

    assert response.status_code == 403


def test_unauthenticated_cannot_create_user(client: TestClient) -> None:
    """POST /admin/users retourne 401 sans cookie."""
    response = client.post(
        "/api/v1/admin/users",
        json={
            "email": "anon@example.com",
            "password": "Sup3rS3cur!",
            "first_name": "A",
            "last_name": "B",
            "role": "superviseur",
        },
    )
    assert response.status_code == 401


# ── DELETE /admin/users/{id} ──────────────────────────────────────────────────

def test_admin_can_soft_delete_user(client: TestClient, db: Session) -> None:
    """DELETE /admin/users/{id} soft-delete l'utilisateur (204) et l'exclut de la liste."""
    target = create_user(db, email="to.delete@example.com")
    headers = _admin_headers(client, db)

    response = client.delete(f"/api/v1/admin/users/{target.id}", headers=headers)

    assert response.status_code == 204

    db.expunge_all()
    deleted = db.query(User).filter(User.id == target.id).one()
    assert deleted.deleted_at is not None

    list_resp = client.get("/api/v1/admin/users", headers=headers)
    emails = [u["email"] for u in list_resp.json()]
    assert target.email not in emails


def test_admin_cannot_delete_own_account(client: TestClient, db: Session) -> None:
    """DELETE /admin/users/{id} retourne 400 si l'admin tente de supprimer son propre compte."""
    admin = create_user(db, role=RoleEnum.admin, email="admin.selfdelete@example.com")
    headers = _cookie(client, email=admin.email, password="SecretMotDePasse1!")

    response = client.delete(f"/api/v1/admin/users/{admin.id}", headers=headers)

    assert response.status_code == 400
    assert "propre compte" in response.json()["detail"]


def test_delete_nonexistent_user_returns_404(client: TestClient, db: Session) -> None:
    """DELETE /admin/users/{id} retourne 404 pour un id inexistant."""
    headers = _admin_headers(client, db)

    response = client.delete("/api/v1/admin/users/99999", headers=headers)

    assert response.status_code == 404


def test_non_admin_cannot_delete_user(client: TestClient, db: Session) -> None:
    """DELETE /admin/users/{id} retourne 403 pour un superviseur."""
    sup = create_user(db, role=RoleEnum.superviseur, email="sup.nodelete@example.com")
    target = create_user(db, email="target.sup@example.com")
    headers = _cookie(client, email=sup.email, password="SecretMotDePasse1!")

    response = client.delete(f"/api/v1/admin/users/{target.id}", headers=headers)

    assert response.status_code == 403


def test_unauthenticated_cannot_delete_user(client: TestClient, db: Session) -> None:
    """DELETE /admin/users/{id} retourne 401 sans cookie."""
    target = create_user(db, email="target.anon@example.com")
    response = client.delete(f"/api/v1/admin/users/{target.id}")
    assert response.status_code == 401
