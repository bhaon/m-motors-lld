"""US-06-07 — Contrat généré à la validation, signature par lien email."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.dossier_contract import DossierContrat
from app.models.user import RoleEnum
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


def _client_cookie(client: TestClient, email: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest_cookie(client: TestClient, db: Session, email: str) -> dict[str, str]:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _client_cookie(client, email)


def test_flow_validate_contract_signature_link(
    client: TestClient,
    db: Session,
    monkeypatch,
) -> None:
    """Validation BO → contrat ; client demande signature ; GET confirm → attente_livraison."""
    emails: list[tuple[str, str]] = []

    def _capture_ready(**kwargs):
        emails.append(("ready", kwargs.get("to_email", "")))

    def _capture_sig(**kwargs):
        emails.append(("sig", kwargs.get("to_email", "")))

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_contract_ready_email", _capture_ready)
    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_contract_signature_link_email", _capture_sig)

    cli = create_user(db, email="cli.us607@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    d = Dossier(
        reference="DOS-US607-001",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.en_instruction,
        client_id=cli.id,
        vehicle_id=veh.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    headers_g = _gest_cookie(client, db, "gest.us607@ex.com")
    r_val = client.patch(f"/api/v1/dossiers/{d.id}/valider", headers=headers_g)
    assert r_val.status_code == 200
    assert r_val.json()["status"] == "en_signature"

    db.refresh(d)
    ctr = db.query(DossierContrat).filter(DossierContrat.dossier_id == d.id).one()
    assert ctr.signed_at is None
    assert len(ctr.body_markdown) > 50

    h_cli = _client_cookie(client, cli.email)
    r_get = client.get(f"/api/v1/dossiers/{d.id}/contrat", headers=h_cli)
    assert r_get.status_code == 200
    assert "CONTRAT" in r_get.json().get("markdown", "") or "M-MOTORS" in r_get.json().get("markdown", "")

    r_post = client.post(
        f"/api/v1/dossiers/{d.id}/contrat/demander-signature",
        headers={**h_cli, "Content-Type": "application/json"},
        json={"accepte": True},
    )
    assert r_post.status_code == 200
    db.refresh(ctr)
    assert ctr.signature_token_hash is not None

    # Récupère le token brut via monkeypatch : on régénère comme le handler (même longueur / hash en base)
    from app.api.v1.endpoints.auth import _generate_email_verification_token, _hash_email_verification_token

    raw = _generate_email_verification_token()
    ctr.signature_token_hash = _hash_email_verification_token(raw)
    db.commit()

    r_conf = client.get(f"/api/v1/auth/confirm-contract-signature?token={raw}")
    assert r_conf.status_code == 200
    db.expire_all()
    d2 = db.query(Dossier).filter(Dossier.id == d.id).one()
    assert d2.status == DossierStatusEnum.attente_livraison
    ctr2 = db.query(DossierContrat).filter(DossierContrat.dossier_id == d.id).one()
    assert ctr2.signed_at is not None
    assert ctr2.signature_token_hash is None
