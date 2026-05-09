"""Tests US-05-04 — Archivage véhicule : soft-delete, filtre back-office et restauration."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.user import RoleEnum
from app.models.vehicle import Vehicle
from tests.conftest import auth_header, create_user, create_vehicle


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gest_headers(db: Session, email: str = "gest.archive@example.com") -> dict:
    g = create_user(db, role=RoleEnum.gestionnaire, email=email)
    return auth_header(g)


def _cookie(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


# ── Archivage (soft-delete) ───────────────────────────────────────────────────

def test_archive_vehicle_soft_deletes_in_db(client: TestClient, db: Session) -> None:
    """DELETE /vehicules/{id} marque le véhicule archived=True sans le supprimer."""
    v = create_vehicle(db)
    headers = _gest_headers(db)

    resp = client.delete(f"/api/v1/vehicules/{v.id}", headers=headers)

    assert resp.status_code == 204
    db.expire_all()
    still_exists = db.query(Vehicle).filter(Vehicle.id == v.id).first()
    assert still_exists is not None
    assert still_exists.archived is True
    assert still_exists.archived_at is not None
    assert still_exists.visible_catalogue is False


def test_archived_vehicle_excluded_from_public_catalogue(client: TestClient, db: Session) -> None:
    """Un véhicule archivé n'apparaît plus dans GET /vehicules (front-office)."""
    v = create_vehicle(db, visible_catalogue=True)
    headers = _gest_headers(db)
    client.delete(f"/api/v1/vehicules/{v.id}", headers=headers)

    resp = client.get("/api/v1/vehicules")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert v.id not in ids


def test_archive_generates_audit_entry(client: TestClient, db: Session) -> None:
    """L'archivage génère une entrée VEHICLE_ARCHIVED dans l'audit trail."""
    v = create_vehicle(db)
    headers = _gest_headers(db)

    client.delete(f"/api/v1/vehicules/{v.id}", headers=headers)

    db.expire_all()
    entry = db.query(AuditTrail).filter(AuditTrail.action == "VEHICLE_ARCHIVED").first()
    assert entry is not None
    assert entry.entity_id == v.id
    assert entry.before_state["archived"] is False
    assert entry.after_state["archived"] is True


# ── Filtre back-office ────────────────────────────────────────────────────────

def test_backoffice_default_excludes_archived(client: TestClient, db: Session) -> None:
    """GET /vehicules/backoffice (sans paramètre) n'inclut pas les archivés."""
    active = create_vehicle(db, make="Active")
    archived = create_vehicle(db, make="Archived", archived=True)
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.filter@example.com")
    headers = _cookie(client, email=gest.email, password="SecretMotDePasse1!")

    resp = client.get("/api/v1/vehicules/backoffice", headers=headers)

    assert resp.status_code == 200
    ids = [v["id"] for v in resp.json()]
    assert active.id in ids
    assert archived.id not in ids


def test_backoffice_archived_filter_returns_only_archived(client: TestClient, db: Session) -> None:
    """GET /vehicules/backoffice?archived=true retourne uniquement les véhicules archivés."""
    active = create_vehicle(db, make="Active2")
    archived = create_vehicle(db, make="Archived2", archived=True)
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.filterar@example.com")
    headers = _cookie(client, email=gest.email, password="SecretMotDePasse1!")

    resp = client.get("/api/v1/vehicules/backoffice?archived=true", headers=headers)

    assert resp.status_code == 200
    ids = [v["id"] for v in resp.json()]
    assert archived.id in ids
    assert active.id not in ids


def test_backoffice_archived_response_includes_archived_at(client: TestClient, db: Session) -> None:
    """La réponse du filtre archivé inclut archived_at et archived=true."""
    from datetime import datetime, timezone
    archived = create_vehicle(db, make="Datee", archived=True)
    # Mettre archived_at manuellement en base
    archived.archived_at = datetime.now(timezone.utc)
    db.commit()
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.archdat@example.com")
    headers = _cookie(client, email=gest.email, password="SecretMotDePasse1!")

    resp = client.get("/api/v1/vehicules/backoffice?archived=true", headers=headers)

    assert resp.status_code == 200
    vehicle_data = next((v for v in resp.json() if v["id"] == archived.id), None)
    assert vehicle_data is not None
    assert vehicle_data["archived"] is True
    assert vehicle_data["archived_at"] is not None


# ── Restauration ──────────────────────────────────────────────────────────────

def test_restore_vehicle_unarchives_in_db(client: TestClient, db: Session) -> None:
    """POST /vehicules/{id}/restaurer remet archived=False et visible_catalogue=True."""
    v = create_vehicle(db, archived=True)
    headers = _gest_headers(db, email="gest.restore@example.com")

    resp = client.post(f"/api/v1/vehicules/{v.id}/restaurer", headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    restored = db.query(Vehicle).filter(Vehicle.id == v.id).first()
    assert restored is not None
    assert restored.archived is False
    assert restored.archived_at is None
    assert restored.visible_catalogue is True


def test_restore_nonexistent_archived_returns_404(client: TestClient, db: Session) -> None:
    """POST /restaurer sur un véhicule non archivé (ou inexistant) → 404."""
    active = create_vehicle(db)  # actif, pas archivé
    headers = _gest_headers(db, email="gest.restore404@example.com")

    resp = client.post(f"/api/v1/vehicules/{active.id}/restaurer", headers=headers)
    assert resp.status_code == 404

    resp2 = client.post("/api/v1/vehicules/99999/restaurer", headers=headers)
    assert resp2.status_code == 404


def test_restore_generates_audit_entry(client: TestClient, db: Session) -> None:
    """La restauration génère une entrée VEHICLE_RESTORED dans l'audit trail."""
    v = create_vehicle(db, archived=True)
    headers = _gest_headers(db, email="gest.restoreaudit@example.com")

    client.post(f"/api/v1/vehicules/{v.id}/restaurer", headers=headers)

    db.expire_all()
    entry = db.query(AuditTrail).filter(AuditTrail.action == "VEHICLE_RESTORED").first()
    assert entry is not None
    assert entry.entity_id == v.id
    assert entry.before_state["archived"] is True
    assert entry.after_state["archived"] is False
    assert entry.after_state["visible_catalogue"] is True


def test_non_gestionnaire_cannot_restore(client: TestClient, db: Session) -> None:
    """Un client ne peut pas restaurer un véhicule → 403."""
    v = create_vehicle(db, archived=True)
    client_user = create_user(db, role=RoleEnum.client, email="client.restore@example.com")
    headers = auth_header(client_user)

    resp = client.post(f"/api/v1/vehicules/{v.id}/restaurer", headers=headers)
    assert resp.status_code == 403
