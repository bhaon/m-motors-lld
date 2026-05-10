"""US-06-10 — Planification livraison depuis le back-office (statut + email client)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


def _cookie(client: TestClient, email: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest_headers(client: TestClient, db: Session, email: str = "gest.liv@ex.com") -> dict[str, str]:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def test_planifier_livraison_ok_and_detail_client(
    client: TestClient,
    db: Session,
    monkeypatch,
) -> None:
    """POST planifier : statut, colonne datetime, historique ; GET client expose livraison."""
    sent: list[dict[str, object]] = []

    def _cap(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_livraison_planifiee_email", _cap)

    cli = create_user(db, email="cli.liv@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-LIV-010",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.attente_livraison,
        client_id=cli.id,
        vehicle_id=veh.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    hdr = _gest_headers(client, db)
    when = datetime.now(timezone.utc) + timedelta(days=3)
    iso = when.replace(microsecond=0).isoformat()

    r = client.post(
        f"/api/v1/dossiers/backoffice/{d.id}/planifier-livraison",
        headers={**hdr, "Content-Type": "application/json"},
        json={"livraison_prevue_at": iso},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "livraison_planifiee"
    assert body["livraison_lieu"] == "Garage Gaudin"
    assert "livraison_prevue_at" in body

    assert len(sent) == 1
    assert sent[0]["to_email"] == cli.email
    assert sent[0]["lieu_livraison"] == "Garage Gaudin"

    db.expire_all()
    row = db.query(Dossier).filter(Dossier.id == d.id).one()
    assert row.status == DossierStatusEnum.livraison_planifiee
    assert row.livraison_prevue_at is not None

    h_cli = _cookie(client, cli.email)
    r_detail = client.get(f"/api/v1/dossiers/{d.id}", headers=h_cli)
    assert r_detail.status_code == 200
    det = r_detail.json()
    assert det["livraison"] is not None
    assert det["livraison"]["lieu"] == "Garage Gaudin"
    assert "prevue_at" in det["livraison"]


def test_planifier_refuse_si_pas_attente_livraison(client: TestClient, db: Session) -> None:
    hdr = _gest_headers(client, db, "gest.liv2@ex.com")
    cli = create_user(db, role=RoleEnum.client, email="cli.liv2@ex.com")
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-LIV-DEP",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.depose,
        client_id=cli.id,
        vehicle_id=veh.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = client.post(
        f"/api/v1/dossiers/backoffice/{d.id}/planifier-livraison",
        headers={**hdr, "Content-Type": "application/json"},
        json={"livraison_prevue_at": when},
    )
    assert r.status_code == 409


def test_planifier_refuse_si_date_passe(client: TestClient, db: Session) -> None:
    hdr = _gest_headers(client, db, "gest.liv3@ex.com")
    cli = create_user(db, role=RoleEnum.client, email="cli.liv3@ex.com")
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-LIV-PAST",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.attente_livraison,
        client_id=cli.id,
        vehicle_id=veh.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    r = client.post(
        f"/api/v1/dossiers/backoffice/{d.id}/planifier-livraison",
        headers={**hdr, "Content-Type": "application/json"},
        json={"livraison_prevue_at": past},
    )
    assert r.status_code == 422


def test_client_detail_sans_livraison_rest_null(client: TestClient, db: Session) -> None:
    cli = create_user(db, email="cli.noliv@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-NOLIV",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.attente_livraison,
        client_id=cli.id,
        vehicle_id=veh.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    h_cli = _cookie(client, cli.email)
    r_detail = client.get(f"/api/v1/dossiers/{d.id}", headers=h_cli)
    assert r_detail.status_code == 200
    assert r_detail.json().get("livraison") is None
