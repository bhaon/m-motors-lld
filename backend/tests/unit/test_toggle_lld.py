"""Tests US-05-03 — Bascule Achat ↔ LLD avec protection dossiers actifs et audit trail."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from tests.conftest import auth_header, create_user, create_vehicle


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gest_headers(db: Session) -> tuple[dict, int]:
    g = create_user(db, role=RoleEnum.gestionnaire, email="gest.toggle@example.com")
    return auth_header(g), g.id


def _create_dossier(db: Session, vehicle_id: int, client_id: int,
                    dossier_status: DossierStatusEnum = DossierStatusEnum.depose) -> Dossier:
    d = Dossier(
        reference=f"DOS-TEST-{vehicle_id}-{dossier_status.value}",
        type=DossierTypeEnum.achat,
        status=dossier_status,
        vehicle_id=vehicle_id,
        client_id=client_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _toggle_url(vehicle_id: int, confirm: bool = False) -> str:
    qs = "?confirm=true" if confirm else ""
    return f"/api/v1/vehicules/{vehicle_id}/toggle-lld{qs}"


# ── Bascule simple ────────────────────────────────────────────────────────────

def test_toggle_achat_to_lld(client: TestClient, db: Session) -> None:
    """Bascule Achat → LLD : toggled=True, lld devient True."""
    v = create_vehicle(db, lld=False)
    headers, _ = _gest_headers(db)

    resp = client.post(_toggle_url(v.id), headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["toggled"] is True
    assert body["vehicle"]["lld"] is True
    assert body["warning"] is None


def test_toggle_lld_to_achat(client: TestClient, db: Session) -> None:
    """Bascule LLD → Achat : toggled=True, lld=False et mensualite=None."""
    v = create_vehicle(db, lld=True, mensualite=299.0)
    headers, _ = _gest_headers(db)

    resp = client.post(_toggle_url(v.id), headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["toggled"] is True
    assert body["vehicle"]["lld"] is False
    assert body["vehicle"]["mensualite"] is None


def test_toggle_nonexistent_vehicle_returns_404(client: TestClient, db: Session) -> None:
    """Toggle sur un véhicule inexistant → 404."""
    headers, _ = _gest_headers(db)
    assert client.post(_toggle_url(99999), headers=headers).status_code == 404


def test_non_gestionnaire_cannot_toggle(client: TestClient, db: Session) -> None:
    """Un client ne peut pas basculer un véhicule → 403."""
    v = create_vehicle(db)
    client_user = create_user(db, role=RoleEnum.client, email="client.toggle@example.com")
    headers = auth_header(client_user)
    assert client.post(_toggle_url(v.id), headers=headers).status_code == 403


# ── Protection dossiers actifs ────────────────────────────────────────────────

def test_toggle_returns_warning_when_active_dossiers_without_confirm(
    client: TestClient, db: Session
) -> None:
    """Sans ?confirm=true, retourne avertissement et toggled=False si dossiers actifs."""
    v = create_vehicle(db, lld=False)
    client_user = create_user(db, role=RoleEnum.client, email="client.active@example.com")
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.depose)
    headers, _ = _gest_headers(db)

    resp = client.post(_toggle_url(v.id), headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["toggled"] is False
    assert body["warning"] is not None
    assert "dossier" in body["warning"].lower()
    assert body["active_dossiers_count"] == 1
    # Le véhicule ne doit pas avoir été modifié en base
    db.expire_all()
    from app.models.vehicle import Vehicle
    unchanged = db.query(Vehicle).filter(Vehicle.id == v.id).first()
    assert unchanged.lld is False


def test_toggle_with_confirm_overrides_warning(client: TestClient, db: Session) -> None:
    """Avec ?confirm=true, la bascule est effectuée même avec des dossiers actifs."""
    v = create_vehicle(db, lld=False)
    client_user = create_user(db, role=RoleEnum.client, email="client.confirm@example.com")
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.en_instruction)
    headers, _ = _gest_headers(db)

    resp = client.post(_toggle_url(v.id, confirm=True), headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["toggled"] is True
    assert body["vehicle"]["lld"] is True
    assert body["active_dossiers_count"] == 1


def test_toggle_no_warning_for_terminal_dossiers(client: TestClient, db: Session) -> None:
    """Les dossiers en statut terminal (valide, rejeté) ne déclenchent pas d'avertissement."""
    v = create_vehicle(db, lld=False)
    client_user = create_user(db, role=RoleEnum.client, email="client.terminal@example.com")
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.valide)
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.rejete)
    headers, _ = _gest_headers(db)

    resp = client.post(_toggle_url(v.id), headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["toggled"] is True
    assert body["warning"] is None
    assert body["active_dossiers_count"] == 0


def test_toggle_warning_counts_only_active_statuses(client: TestClient, db: Session) -> None:
    """Seuls déposé et en_instruction comptent comme dossiers actifs."""
    v = create_vehicle(db, lld=False)
    client_user = create_user(db, role=RoleEnum.client, email="client.count@example.com")
    # 1 actif + 2 terminaux
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.depose)
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.valide)
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.annule)
    headers, _ = _gest_headers(db)

    resp = client.post(_toggle_url(v.id), headers=headers)

    assert resp.json()["active_dossiers_count"] == 1


# ── Audit trail ───────────────────────────────────────────────────────────────

def test_toggle_generates_audit_entry(client: TestClient, db: Session) -> None:
    """Une bascule réussie génère une entrée VEHICLE_LLD_TOGGLED dans l'audit trail."""
    v = create_vehicle(db, lld=False)
    headers, gest_id = _gest_headers(db)

    client.post(_toggle_url(v.id), headers=headers)

    db.expire_all()
    entry = (
        db.query(AuditTrail)
        .filter(AuditTrail.action == "VEHICLE_LLD_TOGGLED")
        .first()
    )
    assert entry is not None
    assert entry.entity_id == v.id
    assert entry.entity_type == "vehicle"
    assert entry.operator_id == gest_id
    assert entry.before_state["lld"] is False
    assert entry.after_state["lld"] is True
    assert entry.created_at.tzinfo is not None


def test_toggle_no_audit_when_warning_not_confirmed(client: TestClient, db: Session) -> None:
    """Pas d'entrée d'audit si la bascule n'est pas effectuée (warning non confirmé)."""
    v = create_vehicle(db, lld=False)
    client_user = create_user(db, role=RoleEnum.client, email="client.noaudit@example.com")
    _create_dossier(db, v.id, client_user.id, DossierStatusEnum.depose)
    headers, _ = _gest_headers(db)

    before_count = db.query(AuditTrail).filter(AuditTrail.action == "VEHICLE_LLD_TOGGLED").count()
    client.post(_toggle_url(v.id), headers=headers)  # sans confirm
    db.expire_all()

    assert db.query(AuditTrail).filter(AuditTrail.action == "VEHICLE_LLD_TOGGLED").count() == before_count
