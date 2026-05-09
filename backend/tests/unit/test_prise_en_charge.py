"""Tests US-06-02 — Prise en charge d'un dossier par le gestionnaire."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from app.services.audit import DOSSIER_PRIS_EN_CHARGE
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cookie(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, f"Login failed: {login.text}"
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest_headers(client: TestClient, db: Session, email: str = "gest@ex.com") -> dict:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def _make_dossier(
    db: Session,
    *,
    client_email: str = "client@ex.com",
    status: DossierStatusEnum = DossierStatusEnum.depose,
    ref: str = "DOS-2026-00001",
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


# ── Accès ─────────────────────────────────────────────────────────────────────

def test_requires_auth(client: TestClient, db: Session) -> None:
    """Sans cookie la réponse est 401."""
    d = _make_dossier(db)
    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge")
    assert resp.status_code == 401


def test_client_cannot_take_dossier(client: TestClient, db: Session) -> None:
    """Un client ordinaire reçoit 403."""
    d = _make_dossier(db, client_email="c.forb@ex.com")
    create_user(db, role=RoleEnum.client, email="client.try@ex.com", password=PASSWORD)
    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/prendre-en-charge",
        headers=_cookie(client, "client.try@ex.com"),
    )
    assert resp.status_code == 403


def test_dossier_not_found_returns_404(client: TestClient, db: Session) -> None:
    """Un id inexistant retourne 404."""
    headers = _gest_headers(client, db, "gest.404@ex.com")
    resp = client.patch("/api/v1/dossiers/99999/prendre-en-charge", headers=headers)
    assert resp.status_code == 404


# ── Prise en charge réussie ───────────────────────────────────────────────────

def test_prendre_en_charge_changes_status(client: TestClient, db: Session) -> None:
    """La prise en charge passe le statut de 'depose' à 'en_instruction'."""
    d = _make_dossier(db)
    headers = _gest_headers(client, db)

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "en_instruction"
    assert body["id"] == d.id
    assert body["reference"] == d.reference


def test_prendre_en_charge_sets_gestionnaire_id(client: TestClient, db: Session) -> None:
    """Le gestionnaire_id est enregistré sur le dossier."""
    d = _make_dossier(db, client_email="c.gest@ex.com")
    create_user(db, role=RoleEnum.gestionnaire, email="g.assign@ex.com", password=PASSWORD)
    headers = _cookie(client, "g.assign@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["gestionnaire_id"] is not None

    db.expire_all()
    updated = db.query(Dossier).filter(Dossier.id == d.id).first()
    assert updated is not None
    assert updated.status == DossierStatusEnum.en_instruction
    assert updated.gestionnaire_id is not None


def test_prendre_en_charge_creates_historique(client: TestClient, db: Session) -> None:
    """Une entrée DossierHistorique est créée avec le bon ancien et nouveau statut."""
    d = _make_dossier(db, client_email="c.hist@ex.com", ref="HIS-001")
    headers = _gest_headers(client, db, "gest.hist@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert resp.status_code == 200

    db.expire_all()
    hist = db.query(DossierHistorique).filter(DossierHistorique.dossier_id == d.id).first()
    assert hist is not None
    assert hist.ancien_status == "depose"
    assert hist.nouveau_status == "en_instruction"
    assert hist.operateur_id is not None


def test_prendre_en_charge_creates_audit_trail(client: TestClient, db: Session) -> None:
    """Une entrée AuditTrail DOSSIER_PRIS_EN_CHARGE est créée."""
    d = _make_dossier(db, client_email="c.audit@ex.com", ref="AUD-001")
    headers = _gest_headers(client, db, "gest.audit@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert resp.status_code == 200

    db.expire_all()
    audit = (
        db.query(AuditTrail)
        .filter(
            AuditTrail.entity_type == "dossier",
            AuditTrail.entity_id == d.id,
            AuditTrail.action == DOSSIER_PRIS_EN_CHARGE,
        )
        .first()
    )
    assert audit is not None
    assert audit.after_state["status"] == "en_instruction"
    assert "gestionnaire_email" in audit.after_state


# ── Règles métier ─────────────────────────────────────────────────────────────

def test_cannot_take_brouillon_dossier(client: TestClient, db: Session) -> None:
    """Un dossier en brouillon ne peut pas être pris en charge → 409."""
    d = _make_dossier(db, client_email="c.bro@ex.com", status=DossierStatusEnum.brouillon, ref="BRO-001")
    headers = _gest_headers(client, db, "gest.bro@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert resp.status_code == 409


def test_cannot_take_valide_dossier(client: TestClient, db: Session) -> None:
    """Un dossier validé ne peut pas être pris en charge → 409."""
    d = _make_dossier(db, client_email="c.val@ex.com", status=DossierStatusEnum.valide, ref="VAL-001")
    headers = _gest_headers(client, db, "gest.val@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert resp.status_code == 409


def test_cannot_take_rejete_dossier(client: TestClient, db: Session) -> None:
    """Un dossier rejeté ne peut pas être pris en charge → 409."""
    d = _make_dossier(db, client_email="c.rej@ex.com", status=DossierStatusEnum.rejete, ref="REJ-001")
    headers = _gest_headers(client, db, "gest.rej@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert resp.status_code == 409


def test_idempotent_already_en_instruction_same_gestionnaire(client: TestClient, db: Session) -> None:
    """Re-prendre un dossier déjà 'en_instruction' par le même gestionnaire est idempotent (200)."""
    create_user(db, role=RoleEnum.gestionnaire, email="g.idem@ex.com", password=PASSWORD)
    headers = _cookie(client, "g.idem@ex.com")
    d = _make_dossier(db, client_email="c.idem@ex.com", ref="IDM-001")

    # Première prise en charge
    r1 = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert r1.status_code == 200

    # Deuxième appel — doit réussir sans créer de doublon en historique
    r2 = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert r2.status_code == 200

    db.expire_all()
    hist_count = db.query(DossierHistorique).filter(DossierHistorique.dossier_id == d.id).count()
    assert hist_count == 1  # une seule entrée malgré deux appels


def test_second_gestionnaire_can_take_en_instruction_dossier(client: TestClient, db: Session) -> None:
    """Un deuxième gestionnaire peut reprendre un dossier 'en_instruction' (réassignation)."""
    create_user(db, role=RoleEnum.gestionnaire, email="g1@ex.com", password=PASSWORD)
    create_user(db, role=RoleEnum.gestionnaire, email="g2@ex.com", password=PASSWORD)
    d = _make_dossier(db, client_email="c.2g@ex.com", ref="TRF-001")

    client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=_cookie(client, "g1@ex.com"))
    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=_cookie(client, "g2@ex.com"))

    assert resp.status_code == 200
    db.expire_all()
    updated = db.query(Dossier).filter(Dossier.id == d.id).first()
    g2 = db.query(create_user.__globals__["User"]).filter_by(email="g2@ex.com").first()
    assert updated is not None
    assert g2 is not None
    assert updated.gestionnaire_id == g2.id


# ── Notifications email ───────────────────────────────────────────────────────

def test_prendre_en_charge_sends_email(client: TestClient, db: Session, monkeypatch) -> None:
    """La prise en charge envoie une notification email au client."""
    sent: list[dict] = []

    def _fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_status_change_email", _fake_send)

    d = _make_dossier(db, client_email="c.mail@ex.com", ref="MAIL-001")
    headers = _gest_headers(client, db, "gest.mail@ex.com")

    resp = client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    assert resp.status_code == 200

    assert len(sent) == 1
    assert sent[0]["to_email"] == "c.mail@ex.com"
    assert sent[0]["nouveau_status"] == "en_instruction"
    assert "MAIL-001" in sent[0]["dossier_reference"]


def test_idempotent_retake_does_not_send_email(client: TestClient, db: Session, monkeypatch) -> None:
    """Re-prendre un dossier par le même gestionnaire n'envoie pas de doublon email."""
    sent: list[dict] = []

    def _fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_status_change_email", _fake_send)

    create_user(db, role=RoleEnum.gestionnaire, email="gest.idem2@ex.com", password=PASSWORD)
    headers = _cookie(client, "gest.idem2@ex.com")
    d = _make_dossier(db, client_email="c.idem2@ex.com", ref="IDEM2-001")

    client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)
    client.patch(f"/api/v1/dossiers/{d.id}/prendre-en-charge", headers=headers)

    assert len(sent) == 1  # un seul email malgré deux appels
