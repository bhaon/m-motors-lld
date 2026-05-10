"""US-07-01 — Options LLD personnalisables (API + persistance ``options_lld``)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum
from app.models.option_lld import OptionLld
from tests.conftest import create_user, create_vehicle


def _auth_cookie_header(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    set_cookie = login.headers.get("set-cookie", "")
    access_token = set_cookie.split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={access_token}"}


def test_create_lld_dossier_seeds_four_option_rows(client: TestClient, db: Session) -> None:
    """À la création d'un dossier LLD, quatre lignes ``options_lld`` sont insérées."""
    user = create_user(db, email="lld.seed@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=250.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    res = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    )
    assert res.status_code == 201
    did = res.json()["id"]
    rows = db.query(OptionLld).filter(OptionLld.dossier_id == did).all()
    assert len(rows) == 4
    codes = sorted(r.code for r in rows)
    assert codes == ["assistance", "assurance", "controle_technique", "entretien"]
    assert all(r.selected is False for r in rows)


def test_get_dossier_detail_includes_lld_pricing(client: TestClient, db: Session) -> None:
    """Le détail dossier expose les quatre options, les montants et le total dynamique."""
    user = create_user(db, email="lld.detail@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=200.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()

    r = client.get(f"/api/v1/dossiers/{created['id']}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "lld"
    lp = body["lld_pricing"]
    assert lp["editable"] is True
    assert lp["base_mensualite_ht"] == 200.0
    assert len(lp["items"]) == 4
    assert lp["options_supplement_ht"] == 0.0
    assert lp["total_mensualite_ht"] == 200.0


def test_patch_lld_options_updates_db_and_totals(client: TestClient, db: Session) -> None:
    """PATCH met à jour ``selected`` et recalcule supplément + total."""
    user = create_user(db, email="lld.patch@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=100.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()
    did = created["id"]

    patch = client.patch(
        f"/api/v1/dossiers/{did}/options-lld",
        headers=headers,
        json={
            "selections": {
                "assurance": True,
                "assistance": False,
                "entretien": True,
                "controle_technique": False,
            }
        },
    )
    assert patch.status_code == 200
    out = patch.json()
    # 39 + 29 = 68
    assert out["options_supplement_ht"] == 68.0
    assert out["total_mensualite_ht"] == 168.0

    row_assurance = (
        db.query(OptionLld).filter(OptionLld.dossier_id == did, OptionLld.code == "assurance").first()
    )
    assert row_assurance is not None and row_assurance.selected is True


def test_patch_lld_options_forbidden_after_depose(client: TestClient, db: Session) -> None:
    """Après dépôt, les options ne sont plus modifiables."""
    user = create_user(db, email="lld.lock@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=150.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()
    did = created["id"]

    d = db.query(Dossier).filter(Dossier.id == did).first()
    assert d is not None

    d.status = DossierStatusEnum.depose
    db.commit()

    res = client.patch(
        f"/api/v1/dossiers/{did}/options-lld",
        headers=headers,
        json={"selections": {"assurance": True}},
    )
    assert res.status_code == 400


def test_patch_lld_unknown_code_returns_400(client: TestClient, db: Session) -> None:
    user = create_user(db, email="lld.badcode@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=150.0)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    ).json()

    res = client.patch(
        f"/api/v1/dossiers/{created['id']}/options-lld",
        headers=headers,
        json={"selections": {"inconnu": True}},
    )
    assert res.status_code == 400


def test_achat_dossier_has_null_lld_pricing(client: TestClient, db: Session) -> None:
    user = create_user(db, email="achat.noopt@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "achat"},
        headers=headers,
    ).json()

    r = client.get(f"/api/v1/dossiers/{created['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json().get("lld_pricing") is None
