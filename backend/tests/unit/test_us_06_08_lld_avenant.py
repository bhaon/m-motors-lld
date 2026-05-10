"""US-06-08 — Avenant + email + signature pour options LLD sous contrat en cours."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import _hash_email_verification_token
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.lld_avenant import LldAvenant
from app.models.option_lld import OptionLld
from app.services.lld_catalog_data import ensure_lld_catalog_seeded
from app.services.lld_options_catalog import ensure_option_rows_for_lld_dossier
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


def _cookie(client: TestClient, email: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _make_lld_contrat_en_cours(db: Session) -> tuple[Dossier, str]:
    """Dossier LLD en cours avec lignes d’options."""
    cli = create_user(db, email="cli.608@ex.com", password=PASSWORD)
    veh = create_vehicle(db, mensualite=300.0)
    d = Dossier(
        reference="DOS-608-LLD",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=cli.id,
        vehicle_id=veh.id,
        date_debut_contrat=date.today(),
        duree_mois=36,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    ensure_lld_catalog_seeded(db)
    ensure_option_rows_for_lld_dossier(db, d)
    db.commit()
    db.refresh(d)
    return d, cli.email


def test_patch_contrat_en_cours_creates_avenant_pending(client: TestClient, db: Session, monkeypatch) -> None:
    """PATCH modifie les options proposées via avenant ; lignes DB inchangées jusqu’à signature."""
    sent: list[object] = []

    def _cap(**_: object) -> None:
        sent.append(True)

    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_avenant_signature_email", _cap)

    d, email = _make_lld_contrat_en_cours(db)
    db.expire_all()
    rows_before = db.query(OptionLld).filter(OptionLld.dossier_id == d.id).all()
    assert rows_before
    first_code = rows_before[0].code
    prev_sel = bool(rows_before[0].selected)

    hdr = _cookie(client, email)
    r = client.patch(
        f"/api/v1/dossiers/{d.id}/options-lld",
        headers=hdr,
        json={"selections": {first_code: not prev_sel}},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("pending_avenant_signature") is True
    assert body.get("avenant_reference", "").startswith("AVA-")
    assert sent == [True]

    db.expire_all()
    row_after = db.query(OptionLld).filter(OptionLld.dossier_id == d.id, OptionLld.code == first_code).one()
    assert bool(row_after.selected) == prev_sel
    assert db.query(LldAvenant).filter(LldAvenant.dossier_id == d.id).count() == 1


def test_confirm_avenant_applies_options_and_updates_contrats_totals(client: TestClient, db: Session, monkeypatch) -> None:
    """GET confirm-avenant-signature applique les sélections ; ``total_mensualite_ht`` sur /contrats."""
    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_avenant_signature_email", lambda **_: None)

    d, email = _make_lld_contrat_en_cours(db)
    rows_before = db.query(OptionLld).filter(OptionLld.dossier_id == d.id).all()
    code = rows_before[0].code

    hdr = _cookie(client, email)
    client.patch(
        f"/api/v1/dossiers/{d.id}/options-lld",
        headers=hdr,
        json={"selections": {code: True}},
    )
    av = db.query(LldAvenant).filter(LldAvenant.dossier_id == d.id).one()
    raw = "test-token-avenant-us608"
    av.signature_token_hash = _hash_email_verification_token(raw)
    av.signature_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    r_ok = client.get(f"/api/v1/auth/confirm-avenant-signature?token={raw}")
    assert r_ok.status_code == 200, r_ok.text

    db.expire_all()
    row = db.query(OptionLld).filter(OptionLld.dossier_id == d.id, OptionLld.code == code).one()
    assert row.selected is True
    av2 = db.query(LldAvenant).filter(LldAvenant.id == av.id).one()
    assert av2.signed_at is not None

    r_ct = client.get("/api/v1/dossiers/contrats", headers=hdr)
    assert r_ct.status_code == 200
    items = r_ct.json()
    mine = next((x for x in items if x["reference"] == d.reference), None)
    assert mine is not None
    assert mine.get("total_mensualite_ht") is not None
    assert float(mine["total_mensualite_ht"]) >= 300.0


def test_patch_second_change_conflict_while_pending(client: TestClient, db: Session, monkeypatch) -> None:
    """Deuxième PATCH : 409 tant qu’un avenant est en attente."""
    monkeypatch.setattr("app.api.v1.endpoints.dossiers.send_avenant_signature_email", lambda **_: None)

    d, email = _make_lld_contrat_en_cours(db)
    rows = db.query(OptionLld).filter(OptionLld.dossier_id == d.id).all()
    code = rows[0].code
    hdr = _cookie(client, email)

    r1 = client.patch(
        f"/api/v1/dossiers/{d.id}/options-lld",
        headers=hdr,
        json={"selections": {code: True}},
    )
    assert r1.status_code == 200

    r2 = client.patch(
        f"/api/v1/dossiers/{d.id}/options-lld",
        headers=hdr,
        json={"selections": {code: False}},
    )
    assert r2.status_code == 409
