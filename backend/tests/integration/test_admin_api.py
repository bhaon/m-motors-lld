"""Tests d'intégration API — Administration (US-08 / US-11)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import application
from app.models.user import RoleEnum
from tests.integration.conftest import (
    create_staff_user,
    register_and_login,
    staff_cookie,
    unique_email,
)


# ── US-08-01 : Liste des utilisateurs ────────────────────────────────────────

def test_list_users_as_admin() -> None:
    """GET /admin/users retourne la liste des utilisateurs pour un admin."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_list"))
            token = staff_cookie(admin)
        finally:
            db.close()

        resp = client.get("/api/v1/admin/users", cookies={"access_token": token})
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        ids = [u["id"] for u in users]
        assert admin.id in ids


def test_list_users_refused_as_gestionnaire() -> None:
    """GET /admin/users retourne 403 pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_lu"))
            token = staff_cookie(gestionnaire)
        finally:
            db.close()

        resp = client.get("/api/v1/admin/users", cookies={"access_token": token})
        assert resp.status_code == 403


def test_list_users_refused_as_client() -> None:
    """GET /admin/users retourne 403 pour un client."""
    with TestClient(application) as client:
        email = unique_email("cl_lu")
        token = register_and_login(client, email)
        resp = client.get("/api/v1/admin/users", cookies={"access_token": token})
        assert resp.status_code == 403


# ── US-08-02 : Création d'un utilisateur par l'admin ─────────────────────────

def test_create_user_as_admin() -> None:
    """POST /admin/users crée un compte gestionnaire — retourne 201 avec l'id."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_cu"))
            token = staff_cookie(admin)
        finally:
            db.close()

        new_email = unique_email("new_gest")
        resp = client.post(
            "/api/v1/admin/users",
            json={
                "email": new_email,
                "password": "GestionnairePass123!",
                "first_name": "Nouveau",
                "last_name": "Gestionnaire",
                "role": "gestionnaire",
            },
            cookies={"access_token": token},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["role"] == "gestionnaire"


def test_create_user_duplicate_409() -> None:
    """POST /admin/users avec un email déjà existant retourne 409."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_dup"))
            token = staff_cookie(admin)
        finally:
            db.close()

        new_email = unique_email("dup_user")
        payload = {
            "email": new_email,
            "password": "Pass123!",
            "first_name": "A",
            "last_name": "B",
            "role": "gestionnaire",
        }
        r1 = client.post("/api/v1/admin/users", json=payload, cookies={"access_token": token})
        assert r1.status_code == 201

        r2 = client.post("/api/v1/admin/users", json=payload, cookies={"access_token": token})
        assert r2.status_code == 409


def test_create_user_refused_as_non_admin() -> None:
    """POST /admin/users retourne 403 pour tout rôle autre qu'admin."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_cu"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        resp = client.post(
            "/api/v1/admin/users",
            json={
                "email": unique_email("x"),
                "password": "Pass123!",
                "first_name": "X",
                "last_name": "Y",
                "role": "gestionnaire",
            },
            cookies={"access_token": token},
        )
        assert resp.status_code == 403


# ── US-08-03 : Changement de rôle ────────────────────────────────────────────

def test_change_role_gestionnaire_to_superviseur() -> None:
    """PATCH /admin/users/{id}/role change le rôle d'un utilisateur."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_cr"))
            admin_token = staff_cookie(admin)
            target = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("target_cr"))
        finally:
            db.close()

        resp = client.patch(
            f"/api/v1/admin/users/{target.id}/role",
            json={"role": "superviseur"},
            cookies={"access_token": admin_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["new_role"] == "superviseur"
        assert data["user_id"] == target.id


def test_change_own_role_400() -> None:
    """PATCH /admin/users/{own_id}/role sur son propre compte retourne 400."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_self"))
            token = staff_cookie(admin)
        finally:
            db.close()

        resp = client.patch(
            f"/api/v1/admin/users/{admin.id}/role",
            json={"role": "gestionnaire"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 400


# ── US-08-04 : Suppression (soft-delete) ─────────────────────────────────────

def test_delete_user_as_admin() -> None:
    """DELETE /admin/users/{id} soft-delete un utilisateur — retourne 204."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_del"))
            admin_token = staff_cookie(admin)
            target = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("del_target"))
        finally:
            db.close()

        resp = client.delete(
            f"/api/v1/admin/users/{target.id}",
            cookies={"access_token": admin_token},
        )
        assert resp.status_code == 204

        list_resp = client.get("/api/v1/admin/users", cookies={"access_token": admin_token})
        ids = [u["id"] for u in list_resp.json()]
        assert target.id not in ids


def test_delete_own_account_400() -> None:
    """DELETE /admin/users/{own_id} retourne 400 — un admin ne peut pas se supprimer."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_delself"))
            token = staff_cookie(admin)
        finally:
            db.close()

        resp = client.delete(f"/api/v1/admin/users/{admin.id}", cookies={"access_token": token})
        assert resp.status_code == 400


def test_delete_user_inexistant_404() -> None:
    """DELETE /admin/users/999999 retourne 404."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_d404"))
            token = staff_cookie(admin)
        finally:
            db.close()

        resp = client.delete("/api/v1/admin/users/999999", cookies={"access_token": token})
        assert resp.status_code == 404


# ── US-11-03 : Audit trail ────────────────────────────────────────────────────

def test_audit_trail_contient_action_creation_user() -> None:
    """GET /admin/audit-trail contient l'action USER_CREATED après création via admin."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_audit"))
            token = staff_cookie(admin)
        finally:
            db.close()

        new_email = unique_email("audit_target")
        client.post(
            "/api/v1/admin/users",
            json={"email": new_email, "password": "AuditPass123!", "first_name": "A", "last_name": "B", "role": "gestionnaire"},
            cookies={"access_token": token},
        )

        resp = client.get(
            "/api/v1/admin/audit-trail",
            params={"action": "USER_CREATED"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        entries = resp.json()
        assert isinstance(entries, list)
        assert len(entries) >= 1
        actions = [e["action"] for e in entries]
        assert "USER_CREATED" in actions


def test_audit_trail_filtre_par_entity_type() -> None:
    """GET /admin/audit-trail?entity_type=user filtre par type d'entité."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_at_filt"))
            token = staff_cookie(admin)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/admin/audit-trail",
            params={"entity_type": "user"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        entries = resp.json()
        assert all(e["entity_type"] == "user" for e in entries)


def test_audit_trail_refused_as_gestionnaire() -> None:
    """GET /admin/audit-trail retourne 403 pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_at"))
            token = staff_cookie(gestionnaire)
        finally:
            db.close()

        resp = client.get("/api/v1/admin/audit-trail", cookies={"access_token": token})
        assert resp.status_code == 403
