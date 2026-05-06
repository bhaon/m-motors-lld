"""Tests du catalogue et du back-office véhicules."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import RoleEnum
from app.models.vehicle import VehicleOption
from tests.conftest import auth_header, create_user, create_vehicle


def _vehicle_payload() -> dict:
    """Payload minimal valide pour POST /vehicules."""
    return {
        "make": "Renault",
        "model": "Clio",
        "year": 2022,
        "km": 5000,
        "moteur": "Essence",
        "prix": 15999.99,
        "lld": False,
        "img": "https://example.com/img.jpg",
        "spec_carburant": "Essence",
        "spec_boite": "Auto",
        "spec_couleur": "Blanc",
        "spec_places": 5,
        "spec_puissance": "90 ch",
    }


def test_catalogue_vide(client: TestClient) -> None:
    """Liste publique vide avec total 0."""
    r = client.get("/api/v1/vehicules")
    assert r.status_code == 200
    assert r.json() == {"total": 0, "items": []}


def test_catalogue_filtres_et_marques(client: TestClient, db: Session) -> None:
    """Filtres marque, kmMax, type achat/lld et endpoint marques."""
    create_vehicle(db, make="Peugeot", model="308", km=8000, lld=False, prix=20000)
    create_vehicle(db, make="Peugeot", model="e208", km=5000, lld=True, prix=25000, mensualite=299.0)

    r = client.get("/api/v1/vehicules", params={"marque": "peugeot"})
    assert r.status_code == 200
    assert r.json()["total"] == 2

    r2 = client.get("/api/v1/vehicules", params={"kmMax": 6000})
    assert r2.json()["total"] == 1

    r3 = client.get("/api/v1/vehicules", params={"type": "lld"})
    assert r3.json()["total"] == 1

    r4 = client.get("/api/v1/vehicules", params={"type": "achat"})
    assert r4.json()["total"] == 1

    r5 = client.get("/api/v1/vehicules", params={"modele": "308", "moteur": "Essence", "prixMax": 21000})
    assert r5.status_code == 200
    assert r5.json()["total"] >= 1

    marques = client.get("/api/v1/vehicules/marques")
    assert marques.status_code == 200
    assert "Peugeot" in marques.json()


def test_fiche_vehicule_404_et_ok(client: TestClient, db: Session) -> None:
    """404 si absent, 200 avec corps attendu si présent."""
    assert client.get("/api/v1/vehicules/999").status_code == 404
    v = create_vehicle(db)
    r = client.get(f"/api/v1/vehicules/{v.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == v.id
    assert body["specs"]["carburant"] == v.spec_carburant
    assert body["options"] == []


def test_bo_create_lld_exige_mensualite(client: TestClient, db: Session) -> None:
    """US-05-01 — offre LLD sans mensualité refusée."""
    g = create_user(db, role=RoleEnum.gestionnaire)
    h = auth_header(g)
    p = _vehicle_payload()
    p["lld"] = True
    p["mensualite"] = None
    r = client.post("/api/v1/vehicules", json=p, headers=h)
    assert r.status_code == 422


def test_bo_vehicule_refuse_client(client: TestClient, db: Session) -> None:
    """Un client ne peut pas créer de véhicule."""
    u = create_user(db, role=RoleEnum.client)
    r = client.post("/api/v1/vehicules", json=_vehicle_payload(), headers=auth_header(u))
    assert r.status_code == 403


def test_bo_vehicule_crud(client: TestClient, db: Session) -> None:
    """Création, mise à jour, toggle LLD et archivage par un gestionnaire."""
    g = create_user(db, role=RoleEnum.gestionnaire)
    h = auth_header(g)

    r = client.post("/api/v1/vehicules", json=_vehicle_payload(), headers=h)
    assert r.status_code == 201
    vid = r.json()["id"]

    r2 = client.patch(
        f"/api/v1/vehicules/{vid}",
        json={"prix": 14999.0},
        headers=h,
    )
    assert r2.status_code == 200
    assert float(r2.json()["prix"]) == 14999.0

    r3 = client.post(f"/api/v1/vehicules/{vid}/toggle-lld", headers=h)
    assert r3.status_code == 200
    assert r3.json()["lld"] is True

    r4 = client.delete(f"/api/v1/vehicules/{vid}", headers=h)
    assert r4.status_code == 204

    assert client.get(f"/api/v1/vehicules/{vid}").status_code == 404


def test_bo_patch_toggle_404(client: TestClient, db: Session) -> None:
    """Patch / toggle sur id inexistant → 404."""
    g = create_user(db, role=RoleEnum.gestionnaire)
    h = auth_header(g)
    assert client.patch("/api/v1/vehicules/999", json={"prix": 1}, headers=h).status_code == 404
    assert client.post("/api/v1/vehicules/999/toggle-lld", headers=h).status_code == 404
    assert client.delete("/api/v1/vehicules/999", headers=h).status_code == 404


def test_vehicle_out_avec_options(db: Session) -> None:
    """VehicleOut.from_orm_vehicle inclut les options liées."""
    from app.schemas.vehicle import VehicleOut

    v = create_vehicle(db)
    db.add(VehicleOption(vehicle_id=v.id, name="GPS", surcharge=15.5))
    db.commit()
    db.refresh(v)
    out = VehicleOut.from_orm_vehicle(v)
    assert len(out.options) == 1
    assert out.options[0].name == "GPS"
    assert out.options[0].n == "GPS"
    assert "€" in out.options[0].p
