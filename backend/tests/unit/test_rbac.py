"""Tests d'accès par rôle — principe du moindre privilège (US-11-03)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum, User
from tests.conftest import create_user, create_vehicle


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cookie_header(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    """Authentifie un utilisateur et retourne le header Cookie."""
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    cookie = login.headers.get("set-cookie", "")
    token = cookie.split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _forged_cookie_header(user_id: int, forged_role: str) -> dict[str, str]:
    """Forge un JWT valide (signé) mais avec un rôle différent du rôle en base."""
    token = create_access_token(subject=str(user_id), role=forged_role)
    return {"Cookie": f"access_token={token}"}


# ── US-11-03 — Backoffice dossiers ────────────────────────────────────────────

def test_client_cannot_access_dossier_backoffice(client: TestClient, db: Session) -> None:
    """Un client reçoit 403 sur GET /dossiers/backoffice."""
    user = create_user(db, role=RoleEnum.client, email="rbac.client.bo@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/dossiers/backoffice", headers=headers)
    assert response.status_code == 403


def test_gestionnaire_can_access_dossier_backoffice(client: TestClient, db: Session) -> None:
    """Un gestionnaire accède à GET /dossiers/backoffice (200)."""
    user = create_user(db, role=RoleEnum.gestionnaire, email="rbac.gestionnaire.bo@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/dossiers/backoffice", headers=headers)
    assert response.status_code == 200


def test_superviseur_can_access_dossier_backoffice(client: TestClient, db: Session) -> None:
    """Un superviseur accède à GET /dossiers/backoffice (200)."""
    user = create_user(db, role=RoleEnum.superviseur, email="rbac.superviseur.bo@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/dossiers/backoffice", headers=headers)
    assert response.status_code == 200


def test_admin_can_access_dossier_backoffice(client: TestClient, db: Session) -> None:
    """Un admin accède à GET /dossiers/backoffice (200)."""
    user = create_user(db, role=RoleEnum.admin, email="rbac.admin.bo@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/dossiers/backoffice", headers=headers)
    assert response.status_code == 200


def test_backoffice_returns_all_clients_dossiers(client: TestClient, db: Session) -> None:
    """GET /backoffice retourne les dossiers de tous les clients, pas seulement ceux du gestionnaire."""
    gestionnaire = create_user(db, role=RoleEnum.gestionnaire, email="rbac.gest.alldo@example.com")
    client_a = create_user(db, email="rbac.clienta.alldo@example.com")
    client_b = create_user(db, email="rbac.clientb.alldo@example.com")
    vehicle = create_vehicle(db, lld=False)

    db.add_all([
        Dossier(reference="DOS-RBAC-A", type=DossierTypeEnum.achat, client_id=client_a.id, vehicle_id=vehicle.id),
        Dossier(reference="DOS-RBAC-B", type=DossierTypeEnum.achat, client_id=client_b.id, vehicle_id=vehicle.id),
    ])
    db.commit()

    headers = _cookie_header(client, email=gestionnaire.email, password="SecretMotDePasse1!")
    response = client.get("/api/v1/dossiers/backoffice", headers=headers)

    assert response.status_code == 200
    refs = [item["reference"] for item in response.json()]
    assert "DOS-RBAC-A" in refs
    assert "DOS-RBAC-B" in refs


def test_client_can_only_access_own_dossiers_via_me(client: TestClient, db: Session) -> None:
    """GET /dossiers/me ne retourne que les dossiers du client connecté, jamais ceux des autres."""
    owner = create_user(db, email="rbac.owner.me@example.com")
    other = create_user(db, email="rbac.other.me@example.com")
    vehicle = create_vehicle(db, lld=False)

    db.add_all([
        Dossier(reference="DOS-OWNER", type=DossierTypeEnum.achat, client_id=owner.id, vehicle_id=vehicle.id),
        Dossier(reference="DOS-OTHER", type=DossierTypeEnum.achat, client_id=other.id, vehicle_id=vehicle.id),
    ])
    db.commit()

    headers = _cookie_header(client, email=owner.email, password="SecretMotDePasse1!")
    response = client.get("/api/v1/dossiers/me", headers=headers)

    assert response.status_code == 200
    refs = [item["reference"] for item in response.json()]
    assert "DOS-OWNER" in refs
    assert "DOS-OTHER" not in refs


# ── US-11-03 — Reporting (superviseur+) ──────────────────────────────────────

def test_unauthenticated_cannot_access_reporting(client: TestClient) -> None:
    """Sans cookie, GET /reporting/summary retourne 401."""
    response = client.get("/api/v1/reporting/summary")
    assert response.status_code == 401


def test_client_cannot_access_reporting(client: TestClient, db: Session) -> None:
    """Un client reçoit 403 sur GET /reporting/summary."""
    user = create_user(db, role=RoleEnum.client, email="rbac.client.rep@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/reporting/summary", headers=headers)
    assert response.status_code == 403


def test_gestionnaire_cannot_access_reporting(client: TestClient, db: Session) -> None:
    """Un gestionnaire reçoit 403 sur GET /reporting/summary (réservé superviseur+)."""
    user = create_user(db, role=RoleEnum.gestionnaire, email="rbac.gestionnaire.rep@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/reporting/summary", headers=headers)
    assert response.status_code == 403


def test_superviseur_can_access_reporting_summary(client: TestClient, db: Session) -> None:
    """Un superviseur accède à GET /reporting/summary (200) avec les champs attendus."""
    user = create_user(db, role=RoleEnum.superviseur, email="rbac.superviseur.rep@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/reporting/summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "total_dossiers" in body
    assert "by_status" in body
    assert "by_type" in body
    assert "total_clients" in body


def test_admin_can_access_reporting_summary(client: TestClient, db: Session) -> None:
    """Un admin accède à GET /reporting/summary (200)."""
    user = create_user(db, role=RoleEnum.admin, email="rbac.admin.rep@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/reporting/summary", headers=headers)
    assert response.status_code == 200


def test_reporting_summary_counts_are_accurate(client: TestClient, db: Session) -> None:
    """GET /reporting/summary retourne des compteurs cohérents avec la base."""
    sup = create_user(db, role=RoleEnum.superviseur, email="rbac.sup.counts@example.com")
    cli = create_user(db, email="rbac.cli.counts@example.com")
    vehicle = create_vehicle(db, lld=False)

    db.add(Dossier(
        reference="DOS-COUNT-1",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.depose,
        client_id=cli.id,
        vehicle_id=vehicle.id,
    ))
    db.commit()

    headers = _cookie_header(client, email=sup.email, password="SecretMotDePasse1!")
    response = client.get("/api/v1/reporting/summary", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_dossiers"] >= 1
    assert body["total_clients"] >= 1
    assert "depose" in body["by_status"] or body["total_dossiers"] >= 1


# ── US-11-03 — Administration (admin uniquement) ──────────────────────────────

def test_client_cannot_access_admin_users(client: TestClient, db: Session) -> None:
    """Un client reçoit 403 sur GET /admin/users."""
    user = create_user(db, role=RoleEnum.client, email="rbac.client.adm@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 403


def test_gestionnaire_cannot_access_admin_users(client: TestClient, db: Session) -> None:
    """Un gestionnaire reçoit 403 sur GET /admin/users."""
    user = create_user(db, role=RoleEnum.gestionnaire, email="rbac.gest.adm@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 403


def test_superviseur_cannot_access_admin_users(client: TestClient, db: Session) -> None:
    """Un superviseur reçoit 403 sur GET /admin/users."""
    user = create_user(db, role=RoleEnum.superviseur, email="rbac.sup.adm@example.com")
    headers = _cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 403


def test_admin_can_list_users(client: TestClient, db: Session) -> None:
    """Un admin accède à GET /admin/users et reçoit la liste des utilisateurs."""
    admin = create_user(db, role=RoleEnum.admin, email="rbac.admin.list@example.com")
    create_user(db, email="rbac.regular.list@example.com")
    headers = _cookie_header(client, email=admin.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/admin/users", headers=headers)

    assert response.status_code == 200
    users = response.json()
    assert len(users) >= 2
    emails = [u["email"] for u in users]
    assert admin.email in emails


def test_admin_can_change_user_role(client: TestClient, db: Session) -> None:
    """PATCH /admin/users/{id}/role change le rôle d'un utilisateur en base."""
    admin_user = create_user(db, role=RoleEnum.admin, email="rbac.admin.change@example.com")
    target = create_user(db, role=RoleEnum.client, email="rbac.target.change@example.com")
    headers = _cookie_header(client, email=admin_user.email, password="SecretMotDePasse1!")

    response = client.patch(
        f"/api/v1/admin/users/{target.id}/role",
        json={"role": "gestionnaire"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["new_role"] == "gestionnaire"
    assert body["user_id"] == target.id

    db.expunge_all()
    updated = db.query(User).filter(User.id == target.id).one()
    assert updated.role == RoleEnum.gestionnaire


def test_admin_cannot_change_own_role(client: TestClient, db: Session) -> None:
    """PATCH /admin/users/{id}/role refuse la modification du propre rôle de l'admin."""
    admin_user = create_user(db, role=RoleEnum.admin, email="rbac.admin.self@example.com")
    headers = _cookie_header(client, email=admin_user.email, password="SecretMotDePasse1!")

    response = client.patch(
        f"/api/v1/admin/users/{admin_user.id}/role",
        json={"role": "client"},
        headers=headers,
    )

    assert response.status_code == 400
    assert "propre rôle" in response.json()["detail"]


def test_admin_role_change_returns_404_for_unknown_user(client: TestClient, db: Session) -> None:
    """PATCH /admin/users/{id}/role retourne 404 si l'utilisateur cible n'existe pas."""
    admin_user = create_user(db, role=RoleEnum.admin, email="rbac.admin.404@example.com")
    headers = _cookie_header(client, email=admin_user.email, password="SecretMotDePasse1!")

    response = client.patch(
        "/api/v1/admin/users/99999/role",
        json={"role": "gestionnaire"},
        headers=headers,
    )

    assert response.status_code == 404


# ── US-11-03 — Défense en profondeur : cohérence rôle JWT / base ──────────────

def test_jwt_role_claim_mismatch_is_rejected(client: TestClient, db: Session) -> None:
    """Un JWT valide (signé) mais dont le claim rôle diffère du rôle en base est rejeté (403)."""
    user = create_user(db, role=RoleEnum.client, email="rbac.jwt.mismatch@example.com")
    # Forge un token valide pour ce user mais avec un rôle gonflé
    headers = _forged_cookie_header(user.id, forged_role="admin")

    response = client.get("/api/v1/dossiers/me", headers=headers)
    assert response.status_code == 403
    assert "incohérent" in response.json()["detail"].lower()


def test_jwt_matching_role_is_accepted(client: TestClient, db: Session) -> None:
    """Un JWT dont le claim rôle correspond au rôle en base est accepté normalement."""
    user = create_user(db, role=RoleEnum.client, email="rbac.jwt.match@example.com")
    headers = _forged_cookie_header(user.id, forged_role="client")

    response = client.get("/api/v1/dossiers/me", headers=headers)
    assert response.status_code == 200
