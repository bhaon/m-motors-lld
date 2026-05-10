"""Tests US-06-04 — Validation d'un dossier par le gestionnaire."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from app.services.audit import DOSSIER_VALIDE
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


def _cookie(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, f"Login failed: {login.text}"
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest_headers(client: TestClient, db: Session, email: str = "gest.val@ex.com") -> dict:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def _make_dossier(
    db: Session,
    *,
    client_email: str = "client.val@ex.com",
    status: DossierStatusEnum = DossierStatusEnum.en_instruction,
    ref: str = "DOS-VAL-001",
) -> Dossier:
    client = create_user(db, role=RoleEnum.client, email=client_email)
    vehicle = create_vehicle(db)
    d = Dossier(
        reference=ref,
        type=DossierTypeEnum.achat,
        status=status,
        client_id=client.id,
        vehicle_id=vehicle.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def test_valider_requires_auth(client: TestClient, db: Session) -> None:
    """Sans cookie la réponse est 401."""
    d = _make_dossier(db)
    resp = client.patch(f"/api/v1/dossiers/{d.id}/valider")
    assert resp.status_code == 401


def test_client_cannot_valider(client: TestClient, db: Session) -> None:
    """Un client ordinaire reçoit 403."""
    d = _make_dossier(db, client_email="c.val403@ex.com")
    create_user(db, role=RoleEnum.client, email="client.val403@ex.com", password=PASSWORD)
    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/valider",
        headers=_cookie(client, "client.val403@ex.com"),
    )
    assert resp.status_code == 403


def test_valider_not_found(client: TestClient, db: Session) -> None:
    """Un id inexistant retourne 404."""
    headers = _gest_headers(client, db, "gest.val404@ex.com")
    resp = client.patch("/api/v1/dossiers/99999/valider", headers=headers)
    assert resp.status_code == 404


def test_valider_sets_status_and_validated_at(client: TestClient, db: Session) -> None:
    """La validation génère un contrat, passe en « en_signature » et renseigne validated_at (UTC)."""
    from app.models.dossier_contract import DossierContrat

    d = _make_dossier(db, client_email="c.ok@ex.com", ref="VAL-OK-001")
    headers = _gest_headers(client, db, "gest.ok@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "en_signature"
    assert body["validated_at"] is not None

    db.expire_all()
    updated = db.query(Dossier).filter(Dossier.id == d.id).first()
    assert updated is not None
    assert updated.status == DossierStatusEnum.en_signature
    assert updated.validated_at is not None
    row = db.query(DossierContrat).filter(DossierContrat.dossier_id == d.id).first()
    assert row is not None
    assert "CONTRAT" in row.reference or "CTR-" in row.reference
    assert len(row.body_markdown) > 100


def test_valider_creates_historique(client: TestClient, db: Session) -> None:
    """Une entrée DossierHistorique relie en_instruction → en_signature."""
    d = _make_dossier(db, client_email="c.histv@ex.com", ref="VAL-HIST-001")
    headers = _gest_headers(client, db, "gest.histv@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)
    assert resp.status_code == 200

    db.expire_all()
    hist = (
        db.query(DossierHistorique)
        .filter(DossierHistorique.dossier_id == d.id, DossierHistorique.nouveau_status == "en_signature")
        .first()
    )
    assert hist is not None
    assert hist.ancien_status == "en_instruction"
    assert hist.operateur_id is not None


def test_valider_creates_audit_trail(client: TestClient, db: Session) -> None:
    """Une entrée AuditTrail DOSSIER_VALIDE avec horodatage et opérateur."""
    d = _make_dossier(db, client_email="c.auditv@ex.com", ref="VAL-AUD-001")
    headers = _gest_headers(client, db, "gest.auditv@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)
    assert resp.status_code == 200

    db.expire_all()
    audit = (
        db.query(AuditTrail)
        .filter(
            AuditTrail.entity_type == "dossier",
            AuditTrail.entity_id == d.id,
            AuditTrail.action == DOSSIER_VALIDE,
        )
        .first()
    )
    assert audit is not None
    assert audit.after_state["status"] == "en_signature"
    assert "validated_at" in audit.after_state
    assert audit.operator_email == "gest.auditv@ex.com"
    assert audit.created_at is not None


def test_cannot_valider_depose(client: TestClient, db: Session) -> None:
    """Un dossier « déposé » ne peut pas être validé directement → 409."""
    d = _make_dossier(db, client_email="c.dep@ex.com", status=DossierStatusEnum.depose, ref="DEP-001")
    headers = _gest_headers(client, db, "gest.dep@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)
    assert resp.status_code == 409


def test_valider_sends_email_to_client(client: TestClient, db: Session, monkeypatch) -> None:
    """Un email « contrat prêt » est envoyé au client avec le lien dossier."""
    sent: list[dict] = []

    def _fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_contract_ready_email", _fake_send)

    d = _make_dossier(db, client_email="c.mailv@ex.com", ref="MAILV-001")
    headers = _gest_headers(client, db, "gest.mailv@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)
    assert resp.status_code == 200

    assert len(sent) == 1
    assert sent[0]["to_email"] == "c.mailv@ex.com"
    assert sent[0]["dossier_reference"] == "MAILV-001"
    assert str(d.id) in sent[0]["contrat_url"]


def test_valider_idempotent_when_already_en_signature(client: TestClient, db: Session, monkeypatch) -> None:
    """Deux appels sur un dossier déjà « en_signature » : pas de doublon historique ni email."""
    sent: list[dict] = []

    def _fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_contract_ready_email", _fake_send)

    d = _make_dossier(db, client_email="c.idemv@ex.com", ref="IDEMV-001")
    headers = _gest_headers(client, db, "gest.idemv@ex.com")

    r1 = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)
    assert r1.status_code == 200
    r2 = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)
    assert r2.status_code == 200

    db.expire_all()
    hist_count = (
        db.query(DossierHistorique)
        .filter(DossierHistorique.dossier_id == d.id, DossierHistorique.nouveau_status == "en_signature")
        .count()
    )
    assert hist_count == 1
    assert len(sent) == 1


def test_bo_detail_includes_validated_at(client: TestClient, db: Session) -> None:
    """GET backoffice inclut validated_at après validation."""
    d = _make_dossier(db, client_email="c.detv@ex.com", ref="DETV-001")
    headers = _gest_headers(client, db, "gest.detv@ex.com")
    client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers)

    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json().get("validated_at") is not None
