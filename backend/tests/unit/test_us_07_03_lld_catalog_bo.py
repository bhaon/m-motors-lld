"""US-07-03 — Catalogue options LLD configurable depuis le back-office."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import RoleEnum
from tests.conftest import create_user, create_vehicle


def _gest_cookie(client: TestClient, db: Session, *, email: str = "gest.us703@example.com") -> dict[str, str]:
    create_user(db, role=RoleEnum.gestionnaire, email=email)
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "SecretMotDePasse1!"})
    assert login.status_code == 200
    set_cookie = login.headers.get("set-cookie", "")
    token = set_cookie.split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def test_bo_catalog_lists_four_options(client: TestClient, db: Session) -> None:
    """GET backoffice/lld-catalog expose quatre options avec prix et activation."""
    headers = _gest_cookie(client, db)
    res = client.get("/api/v1/backoffice/lld-catalog", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 4
    codes = sorted(i["code"] for i in data["items"])
    assert codes == ["assistance", "assurance", "controle_technique", "entretien"]
    assert all(i["enabled"] is True for i in data["items"])
    assert data["items"][0]["surcout_mensuel_ht"] >= 0


def test_client_forbidden_bo_catalog(client: TestClient, db: Session) -> None:
    """Un client ne peut pas consulter le catalogue administrateur."""
    u = create_user(db, email="cli.cat@example.com")
    login = client.post("/api/v1/auth/login", json={"email": u.email, "password": "SecretMotDePasse1!"})
    tok = login.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]
    headers = {"Cookie": f"access_token={tok}"}
    res = client.get("/api/v1/backoffice/lld-catalog", headers=headers)
    assert res.status_code == 403


def test_patch_updates_label_and_description(client: TestClient, db: Session) -> None:
    headers = _gest_cookie(client, db, email="gest.patch@example.com")
    res = client.patch(
        "/api/v1/backoffice/lld-catalog/assurance",
        headers=headers,
        json={"label": "Assurance étendue", "description": "Nouvelle description détaillée."},
    )
    assert res.status_code == 200
    assert res.json()["label"] == "Assurance étendue"
    assert res.json()["description"] == "Nouvelle description détaillée."


def test_put_activation_false_hides_option_from_client_detail(client: TestClient, db: Session) -> None:
    """Désactivation via flag : l’option disparaît du détail dossier client."""
    headers_gest = _gest_cookie(client, db, email="gest.off@example.com")
    off = client.put(
        "/api/v1/backoffice/lld-catalog/assistance/activation",
        headers=headers_gest,
        json={"enabled": False},
    )
    assert off.status_code == 200
    assert off.json()["enabled"] is False

    user = create_user(db, email="cli.off@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=100.0)
    login = client.post("/api/v1/auth/login", json={"email": user.email, "password": "SecretMotDePasse1!"})
    tok = login.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]
    h_client = {"Cookie": f"access_token={tok}"}
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=h_client,
    ).json()
    detail = client.get(f"/api/v1/dossiers/{created['id']}", headers=h_client).json()
    codes = [i["code"] for i in detail["lld_pricing"]["items"]]
    assert "assistance" not in codes
    assert len(codes) == 3


def test_post_price_appends_history(client: TestClient, db: Session) -> None:
    """Un nouveau tarif crée une ligne d’historique consultable."""
    headers = _gest_cookie(client, db, email="gest.price@example.com")
    before = client.get("/api/v1/backoffice/lld-catalog/entretien/price-history", headers=headers)
    assert before.status_code == 200
    n0 = len(before.json()["history"])

    post = client.post(
        "/api/v1/backoffice/lld-catalog/entretien/price",
        headers=headers,
        json={"surcout_mensuel_ht": 34.5},
    )
    assert post.status_code == 200
    assert post.json()["surcout_mensuel_ht"] == 34.5

    after = client.get("/api/v1/backoffice/lld-catalog/entretien/price-history", headers=headers)
    assert len(after.json()["history"]) == n0 + 1
    assert after.json()["history"][0]["price_ht"] == 34.5


def test_new_lld_dossier_uses_latest_catalog_price(client: TestClient, db: Session) -> None:
    """Après hausse de tarif catalogue, un nouveau dossier LLD embarque le nouveau montant sur la ligne option."""
    headers = _gest_cookie(client, db, email="gest.newd@example.com")
    client.post(
        "/api/v1/backoffice/lld-catalog/controle_technique/price",
        headers=headers,
        json={"surcout_mensuel_ht": 12.0},
    )

    user = create_user(db, email="cli.newp@example.com")
    vehicle = create_vehicle(db, lld=True, mensualite=50.0)
    login = client.post("/api/v1/auth/login", json={"email": user.email, "password": "SecretMotDePasse1!"})
    tok = login.headers.get("set-cookie", "").split("access_token=")[1].split(";")[0]
    h_client = {"Cookie": f"access_token={tok}"}
    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=h_client,
    ).json()
    detail = client.get(f"/api/v1/dossiers/{created['id']}", headers=h_client).json()
    row = next(i for i in detail["lld_pricing"]["items"] if i["code"] == "controle_technique")
    assert row["surcout_mensuel_ht"] == 12.0
