"""US-07-02 — Modifier les options LLD sur contrat actif + audit."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.dossier import Dossier, DossierStatusEnum
from app.services import audit as audit_service
from tests.conftest import create_user, create_vehicle


def _auth_cookie_header(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    set_cookie = login.headers.get("set-cookie", "")
    access_token = set_cookie.split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={access_token}"}


def test_patch_lld_options_allowed_on_valide_contrat_actif(client: TestClient, db: Session) -> None:
    """Un dossier LLD validé avec contrat encore en cours permet la mise à jour des options."""
    user = create_user(db, email="lld.actif@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=120.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()
    did = created["id"]

    d = db.query(Dossier).filter(Dossier.id == did).first()
    assert d is not None
    d.status = DossierStatusEnum.valide
    d.date_debut_contrat = date.today() - timedelta(days=120)
    d.duree_mois = 48
    db.commit()

    before_audit = db.query(AuditTrail).filter(AuditTrail.action == audit_service.LLD_OPTIONS_UPDATED).count()

    res = client.patch(
        f"/api/v1/dossiers/{did}/options-lld",
        headers=headers,
        json={
            "selections": {
                "assurance": True,
                "assistance": False,
                "entretien": False,
                "controle_technique": False,
            }
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["editable"] is True
    assert body["edit_context"] == "contrat_actif"
    assert body["options_supplement_ht"] == 39.0

    assert (
        db.query(AuditTrail).filter(AuditTrail.action == audit_service.LLD_OPTIONS_UPDATED).count()
        == before_audit + 1
    )
    entry = (
        db.query(AuditTrail)
        .filter(AuditTrail.action == audit_service.LLD_OPTIONS_UPDATED, AuditTrail.entity_id == did)
        .order_by(AuditTrail.created_at.desc())
        .first()
    )
    assert entry is not None
    assert entry.created_at is not None
    assert entry.before_state is not None and entry.after_state is not None
    assert entry.after_state["total_mensuel_ht"] == 159.0


def test_patch_lld_options_forbidden_contrat_expire(client: TestClient, db: Session) -> None:
    """Contrat terminé : plus de modification d'options."""
    user = create_user(db, email="lld.expire@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=100.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()
    did = created["id"]

    d = db.query(Dossier).filter(Dossier.id == did).first()
    assert d is not None
    d.status = DossierStatusEnum.valide
    d.date_debut_contrat = date(2020, 1, 1)
    d.duree_mois = 24
    db.commit()

    res = client.patch(
        f"/api/v1/dossiers/{did}/options-lld",
        headers=headers,
        json={
            "selections": {
                "assurance": True,
                "assistance": False,
                "entretien": False,
                "controle_technique": False,
            }
        },
    )
    assert res.status_code == 400
    assert "terminé" in res.json()["detail"].lower()


def test_patch_identical_selections_skips_audit(client: TestClient, db: Session) -> None:
    """Aucune ligne d'audit si les sélections envoyées sont identiques à l'état courant."""
    user = create_user(db, email="lld.noop@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=100.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()
    did = created["id"]

    sel_with_assurance = {
        "assurance": True,
        "assistance": False,
        "entretien": False,
        "controle_technique": False,
    }
    client.patch(
        f"/api/v1/dossiers/{did}/options-lld",
        headers=headers,
        json={"selections": sel_with_assurance},
    )
    count_after_first = db.query(AuditTrail).filter(AuditTrail.action == audit_service.LLD_OPTIONS_UPDATED).count()

    client.patch(
        f"/api/v1/dossiers/{did}/options-lld",
        headers=headers,
        json={"selections": sel_with_assurance},
    )
    assert (
        db.query(AuditTrail).filter(AuditTrail.action == audit_service.LLD_OPTIONS_UPDATED).count()
        == count_after_first
    )


def test_get_dossier_lld_pricing_edit_context_contrat_actif(client: TestClient, db: Session) -> None:
    """Le détail dossier expose edit_context contrat_actif pour un LLD validé actif."""
    user = create_user(db, email="lld.ctx@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=90.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()
    did = created["id"]

    d = db.query(Dossier).filter(Dossier.id == did).first()
    assert d is not None
    d.status = DossierStatusEnum.valide
    d.date_debut_contrat = date.today()
    d.duree_mois = 36
    db.commit()

    r = client.get(f"/api/v1/dossiers/{did}", headers=headers)
    assert r.status_code == 200
    lp = r.json()["lld_pricing"]
    assert lp["editable"] is True
    assert lp["edit_context"] == "contrat_actif"
