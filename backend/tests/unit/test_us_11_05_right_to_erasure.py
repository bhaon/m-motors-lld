"""Tests US-11-05 — droit à l'effacement (demande client, soft delete, email, purge)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core import config
from app.models.audit import AuditTrail
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum, User
from app.services import data_retention
from tests.conftest import create_user, create_vehicle


def _cookie(client: TestClient, *, email: str, password: str = "SecretMotDePasse1!") -> dict[str, str]:
    """Authentifie et retourne l'en-tête Cookie JWT."""
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def test_client_request_data_erasure_soft_deletes_and_clears_cookie(client: TestClient, db) -> None:
    """POST /auth/request-data-erasure désactive le compte, pose deleted_at et supprime le cookie."""
    u = create_user(db, role=RoleEnum.client, email="effacement.client@example.com")
    headers = _cookie(client, email=u.email)

    resp = client.post("/api/v1/auth/request-data-erasure", headers=headers)
    assert resp.status_code == 200
    assert "demande" in resp.json()["message"].lower()
    assert "set-cookie" in resp.headers and "access_token" in resp.headers["set-cookie"].lower()

    db.expire_all()
    row = db.query(User).filter(User.id == u.id).first()
    assert row is not None
    assert row.deleted_at is not None
    assert row.is_active is False


def test_client_erasure_records_audit_entry(client: TestClient, db) -> None:
    """Une entrée CLIENT_DATA_ERASURE_REQUESTED est tracée dans l'audit trail."""
    u = create_user(db, role=RoleEnum.client, email="audit.erasure@example.com")
    headers = _cookie(client, email=u.email)

    client.post("/api/v1/auth/request-data-erasure", headers=headers)

    entry = (
        db.query(AuditTrail)
        .filter(AuditTrail.action == "CLIENT_DATA_ERASURE_REQUESTED", AuditTrail.entity_id == u.id)
        .first()
    )
    assert entry is not None
    assert entry.after_state is not None
    assert entry.after_state.get("is_active") is False


def test_non_client_cannot_request_data_erasure(client: TestClient, db) -> None:
    """Les rôles hors client reçoivent 403 sur la demande d'effacement."""
    u = create_user(db, role=RoleEnum.gestionnaire, email="gestionnaire.erase@example.com")
    headers = _cookie(client, email=u.email)

    resp = client.post("/api/v1/auth/request-data-erasure", headers=headers)
    assert resp.status_code == 403


def test_second_erasure_request_after_soft_delete_returns_401(client: TestClient, db) -> None:
    """Après effacement, le compte est inactif : une nouvelle requête authentifiée échoue (401)."""
    u = create_user(db, role=RoleEnum.client, email="double.erase@example.com")
    headers = _cookie(client, email=u.email)
    assert client.post("/api/v1/auth/request-data-erasure", headers=headers).status_code == 200

    resp = client.post("/api/v1/auth/request-data-erasure", headers=headers)
    assert resp.status_code == 401


def test_erasure_triggers_confirmation_email(client: TestClient, db, monkeypatch) -> None:
    """Le flux appelle l'envoi d'email de confirmation (effacement)."""
    captured: dict[str, str] = {}

    def _fake_send(*, to_email: str, requested_at_display: str, response_deadline_display: str) -> None:
        captured["to_email"] = to_email
        captured["requested_at_display"] = requested_at_display
        captured["response_deadline_display"] = response_deadline_display

    monkeypatch.setattr("app.api.v1.endpoints.auth.send_data_erasure_confirmation_email", _fake_send)

    u = create_user(db, role=RoleEnum.client, email="email.erasure@example.com")
    headers = _cookie(client, email=u.email)
    client.post("/api/v1/auth/request-data-erasure", headers=headers)

    assert captured.get("to_email") == "email.erasure@example.com"
    assert captured.get("requested_at_display")
    assert captured.get("response_deadline_display")


def test_hard_delete_purge_skips_client_with_dossier(db, monkeypatch) -> None:
    """La purge physique ne supprime pas un client encore référencé par un dossier."""
    monkeypatch.setattr(config.settings, "CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS", 1)
    u = create_user(db, role=RoleEnum.client, email="purge.skip@example.com")
    v = create_vehicle(db)
    d = Dossier(
        reference="DOSSIER-PURGE-1",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.brouillon,
        client_id=u.id,
        vehicle_id=v.id,
    )
    db.add(d)
    u.deleted_at = datetime.now(timezone.utc) - timedelta(days=5)
    db.commit()

    n = data_retention.hard_delete_expired_soft_deleted_clients_without_dossiers(db)
    assert n == 0
    assert db.query(User).filter(User.id == u.id).first() is not None


def test_hard_delete_purge_removes_client_without_dossier(db, monkeypatch) -> None:
    """Un client soft-deleted sans dossier, au-delà du délai configuré, est supprimé définitivement."""
    monkeypatch.setattr(config.settings, "CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS", 1)
    u = create_user(db, role=RoleEnum.client, email="purge.ok@example.com")
    u.deleted_at = datetime.now(timezone.utc) - timedelta(days=5)
    db.commit()
    uid = u.id

    n = data_retention.hard_delete_expired_soft_deleted_clients_without_dossiers(db)
    assert n == 1
    assert db.query(User).filter(User.id == uid).first() is None


def test_legal_retention_summary_is_non_empty() -> None:
    """Le référentiel de conservation expose au moins les grandes catégories."""
    summary = data_retention.legal_retention_categories()
    assert "donnees_comptables_facturation" in summary
