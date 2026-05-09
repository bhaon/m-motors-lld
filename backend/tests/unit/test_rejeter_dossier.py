"""Tests US-06-05 — Rejet d'un dossier avec motif obligatoire."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from app.services.audit import DOSSIER_REJETE
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"
MOTIF_OK = "Motif suffisamment détaillé pour le client."  # > 20 chars


def _cookie(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, f"Login failed: {login.text}"
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest_headers(client: TestClient, db: Session, email: str = "gest.rej@ex.com") -> dict:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def _make_dossier(
    db: Session,
    *,
    client_email: str = "client.rej@ex.com",
    status: DossierStatusEnum = DossierStatusEnum.en_instruction,
    ref: str = "REJ-DOS-001",
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


def test_rejeter_requires_auth(client: TestClient, db: Session) -> None:
    """Sans cookie la réponse est 401."""
    d = _make_dossier(db)
    resp = client.patch(f"/api/v1/dossiers/{d.id}/rejeter", json={"motif": MOTIF_OK})
    assert resp.status_code == 401


def test_client_forbidden(client: TestClient, db: Session) -> None:
    """Un client ne peut pas rejeter → 403."""
    d = _make_dossier(db, client_email="c.only@ex.com")
    create_user(db, role=RoleEnum.client, email="c.bad@ex.com", password=PASSWORD)
    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=_cookie(client, "c.bad@ex.com"),
    )
    assert resp.status_code == 403


def test_rejeter_motif_trop_court_422(client: TestClient, db: Session) -> None:
    """Un motif de moins de 20 caractères utiles → 422."""
    d = _make_dossier(db)
    headers = _gest_headers(client, db, "gest.short@ex.com")
    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": "court"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_rejeter_depose_ok(client: TestClient, db: Session) -> None:
    """Rejet depuis « depose » : statut rejete, motif et rejected_at."""
    d = _make_dossier(db, status=DossierStatusEnum.depose, ref="DEP-RJ-01")
    headers = _gest_headers(client, db, "gest.deprej@ex.com")

    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "rejete"
    assert body["motif_rejet"] == MOTIF_OK
    assert body["rejected_at"] is not None

    db.expire_all()
    row = db.query(Dossier).filter(Dossier.id == d.id).first()
    assert row.status == DossierStatusEnum.rejete
    assert row.motif_rejet == MOTIF_OK
    assert row.rejected_at is not None


def test_rejeter_en_instruction_ok(client: TestClient, db: Session) -> None:
    """Rejet depuis « en_instruction »."""
    d = _make_dossier(db, status=DossierStatusEnum.en_instruction, ref="INS-RJ-01")
    headers = _gest_headers(client, db, "gest.ins@ex.com")

    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejete"


def test_rejeter_brouillon_409(client: TestClient, db: Session) -> None:
    """Impossible de rejeter un brouillon."""
    d = _make_dossier(db, status=DossierStatusEnum.brouillon, ref="BR-01")
    headers = _gest_headers(client, db, "gest.br@ex.com")
    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert resp.status_code == 409


def test_rejeter_valide_409(client: TestClient, db: Session) -> None:
    """Impossible de rejeter un dossier déjà validé."""
    d = _make_dossier(db, status=DossierStatusEnum.valide, ref="VAL-RJ-01")
    headers = _gest_headers(client, db, "gest.valrj@ex.com")
    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert resp.status_code == 409


def test_rejeter_audit_trail(client: TestClient, db: Session) -> None:
    """Entrée DOSSIER_REJETE avec motif et opérateur."""
    d = _make_dossier(db, client_email="c.audrej@ex.com", ref="AUD-RJ-01")
    headers = _gest_headers(client, db, "gest.audrej@ex.com")

    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert resp.status_code == 200

    db.expire_all()
    audit = (
        db.query(AuditTrail)
        .filter(
            AuditTrail.entity_type == "dossier",
            AuditTrail.entity_id == d.id,
            AuditTrail.action == DOSSIER_REJETE,
        )
        .first()
    )
    assert audit is not None
    assert audit.after_state["motif_rejet"] == MOTIF_OK
    assert audit.operator_email == "gest.audrej@ex.com"


def test_rejeter_email_includes_motif(client: TestClient, db: Session, monkeypatch) -> None:
    """La notification transmet le motif au service d'email."""
    sent: list[dict] = []

    def _fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_status_change_email", _fake_send)

    d = _make_dossier(db, client_email="c.mailrej@ex.com", ref="MAIL-RJ-01")
    headers = _gest_headers(client, db, "gest.mailrej@ex.com")

    resp = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert resp.status_code == 200
    assert len(sent) == 1
    assert sent[0]["motif_rejet"] == MOTIF_OK
    assert sent[0]["nouveau_status"] == "rejete"
    assert sent[0]["to_email"] == "c.mailrej@ex.com"


def test_rejeter_idempotent(client: TestClient, db: Session, monkeypatch) -> None:
    """Second appel sur dossier déjà rejeté : pas de doublon historique ni email."""
    sent: list[dict] = []

    def _fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_status_change_email", _fake_send)

    d = _make_dossier(db, client_email="c.idemrej@ex.com", ref="IDEM-RJ-01")
    headers = _gest_headers(client, db, "gest.idemrej@ex.com")

    r1 = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    r2 = client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )
    assert r1.status_code == 200
    assert r2.status_code == 200

    db.expire_all()
    hist_n = (
        db.query(DossierHistorique)
        .filter(DossierHistorique.dossier_id == d.id, DossierHistorique.nouveau_status == "rejete")
        .count()
    )
    assert hist_n == 1
    assert len(sent) == 1


def test_client_voit_motif_apres_rejet(client: TestClient, db: Session) -> None:
    """Le détail client expose le motif de rejet après action gestionnaire."""
    client_email = "client.vue@ex.com"
    d = _make_dossier(db, client_email=client_email, ref="VUE-RJ-01")
    headers_gest = _gest_headers(client, db, "gest.vue@ex.com")

    client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers_gest,
    )

    resp = client.get(
        f"/api/v1/dossiers/{d.id}",
        headers=_cookie(client, client_email),
    )
    assert resp.status_code == 200
    assert resp.json()["motif_rejet"] == MOTIF_OK
    assert resp.json()["status"] == "rejete"


def test_bo_detail_includes_rejected_at(client: TestClient, db: Session) -> None:
    """GET backoffice expose rejected_at après rejet."""
    d = _make_dossier(db, ref="BO-RJ-01")
    headers = _gest_headers(client, db, "gest.borj@ex.com")
    client.patch(
        f"/api/v1/dossiers/{d.id}/rejeter",
        json={"motif": MOTIF_OK},
        headers=headers,
    )

    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json().get("rejected_at") is not None
