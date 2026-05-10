"""US-06-09 — Livraison effective sur dossier planifié : clôture + début contrat LLD (36 mois)."""

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


def _gest_headers(client: TestClient, db: Session, email: str = "gest.609@ex.com") -> dict[str, str]:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def test_effectuer_livraison_lld_maj_contrat_et_contrats_client(client: TestClient, db: Session, monkeypatch) -> None:
    """POST effectuer-livraison LLD : contrat_en_cours, date_debut = jour livraison FR, duree 36 ; GET /contrats exposé."""

    def _noop(*_a, **_k):
        pass

    monkeypatch.setattr("app.api.v1.endpoints.dossiers._notify_status_change", _noop)

    cli = create_user(db, email="cli.609@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    prevue = datetime(2026, 7, 14, 8, 30, tzinfo=timezone.utc)
    d = Dossier(
        reference="DOS-609-LLD",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.livraison_planifiee,
        client_id=cli.id,
        vehicle_id=veh.id,
        livraison_prevue_at=prevue,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    hdr = _gest_headers(client, db)
    r = client.post(f"/api/v1/dossiers/backoffice/{d.id}/effectuer-livraison", headers=hdr)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "contrat_en_cours"
    assert body["duree_mois"] == 36
    assert body["date_debut_contrat"] == "2026-07-14"

    db.expire_all()
    row = db.query(Dossier).filter(Dossier.id == d.id).one()
    assert row.status == DossierStatusEnum.contrat_en_cours
    assert row.duree_mois == 36

    h_cli = _cookie(client, cli.email)
    r_contrats = client.get("/api/v1/dossiers/contrats", headers=h_cli)
    assert r_contrats.status_code == 200
    contrats = r_contrats.json()
    assert len(contrats) == 1
    assert contrats[0]["duree_mois"] == 36
    assert contrats[0]["date_debut"] == "2026-07-14"


def test_effectuer_livraison_achat_sans_dates_contrat(client: TestClient, db: Session, monkeypatch) -> None:
    def _noop(*_a, **_k):
        pass

    monkeypatch.setattr("app.api.v1.endpoints.dossiers._notify_status_change", _noop)

    cli = create_user(db, email="cli.609a@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-609-ACH",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.livraison_planifiee,
        client_id=cli.id,
        vehicle_id=veh.id,
        livraison_prevue_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    hdr = _gest_headers(client, db, "gest.609a@ex.com")
    r = client.post(f"/api/v1/dossiers/backoffice/{d.id}/effectuer-livraison", headers=hdr)
    assert r.status_code == 200
    assert r.json()["status"] == "cloture"
    assert r.json().get("date_debut_contrat") is None
    assert r.json().get("duree_mois") is None


def test_effectuer_refuse_si_pas_planifie(client: TestClient, db: Session) -> None:
    hdr = _gest_headers(client, db, "gest.609b@ex.com")
    cli = create_user(db, role=RoleEnum.client, email="cli.609b@ex.com")
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-609-DEP",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.depose,
        client_id=cli.id,
        vehicle_id=veh.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    r = client.post(f"/api/v1/dossiers/backoffice/{d.id}/effectuer-livraison", headers=hdr)
    assert r.status_code == 409
