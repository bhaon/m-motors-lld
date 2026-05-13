"""Tests d'intégration API — Catalogue véhicules (US-01, US-05)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import application
from app.models.user import RoleEnum
from tests.integration.conftest import (
    create_staff_user,
    create_vehicle_in_db,
    register_and_login,
    staff_cookie,
    unique_email,
)


# ── US-01-01 : Catalogue public ────────────────────────────────────────────────

def test_catalogue_retourne_vehicules_visibles() -> None:
    """GET /vehicules renvoie uniquement les véhicules visibles et non-archivés."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            v1 = create_vehicle_in_db(db, make="Peugeot", model="208", visible_catalogue=True)
            hidden = create_vehicle_in_db(db, make="Citroën", model="C3", visible_catalogue=False)
            archived = create_vehicle_in_db(db, make="Toyota", model="Yaris", archived=True)
            v1_id, hidden_id, archived_id = v1.id, hidden.id, archived.id
        finally:
            db.close()

        resp = client.get("/api/v1/vehicules")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data and "items" in data
        ids = [item["id"] for item in data["items"]]
        assert v1_id in ids
        assert hidden_id not in ids
        assert archived_id not in ids


def test_catalogue_filtre_par_marque() -> None:
    """GET /vehicules?marque=BMW ne retourne que les BMW."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            bmw = create_vehicle_in_db(db, make="BMW", model="Serie 3")
            create_vehicle_in_db(db, make="Audi", model="A4")
            bmw_id = bmw.id
        finally:
            db.close()

        resp = client.get("/api/v1/vehicules", params={"marque": "BMW"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert any(i["id"] == bmw_id for i in items)
        assert all(i["make"].upper() == "BMW" for i in items)


def test_catalogue_filtre_type_lld() -> None:
    """GET /vehicules?type=lld ne retourne que les véhicules LLD."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            create_vehicle_in_db(db, make="VW", model="Golf", lld=False)
            lld_v = create_vehicle_in_db(db, make="VW", model="Polo", lld=True, mensualite=299.0)
            lld_id = lld_v.id
        finally:
            db.close()

        resp = client.get("/api/v1/vehicules", params={"type": "lld"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert any(i["id"] == lld_id for i in items)
        assert all(i["lld"] for i in items)


def test_catalogue_filtre_prix_max() -> None:
    """GET /vehicules?prixMax=15000 exclut les véhicules plus chers."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            cheap = create_vehicle_in_db(db, make="Dacia", model="Sandero", prix=12990.0)
            create_vehicle_in_db(db, make="Mercedes", model="Classe C", prix=45000.0)
            cheap_id = cheap.id
        finally:
            db.close()

        resp = client.get("/api/v1/vehicules", params={"prixMax": 15000})
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert any(i["id"] == cheap_id for i in items)
        assert all(float(i["prix"]) <= 15000 for i in items)


# ── US-01-03 : Liste des marques ───────────────────────────────────────────────

def test_liste_marques_retourne_marques_distinctes() -> None:
    """GET /vehicules/marques retourne des valeurs uniques triées."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            create_vehicle_in_db(db, make="Honda", model="Civic")
            create_vehicle_in_db(db, make="Honda", model="Jazz")
            create_vehicle_in_db(db, make="Kia", model="Rio")
        finally:
            db.close()

        resp = client.get("/api/v1/vehicules/marques")
        assert resp.status_code == 200
        marques = resp.json()
        assert isinstance(marques, list)
        assert len(marques) == len(set(marques)), "Les marques doivent être uniques"
        assert marques == sorted(marques), "Les marques doivent être triées"
        assert "Honda" in marques
        assert "Kia" in marques


# ── US-01-04 : Fiche détaillée ─────────────────────────────────────────────────

def test_get_vehicle_detail_200() -> None:
    """GET /vehicules/{id} retourne la fiche complète d'un véhicule actif."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            v = create_vehicle_in_db(db, make="Ford", model="Focus", year=2021, prix=22500.0)
            vid = v.id
        finally:
            db.close()

        resp = client.get(f"/api/v1/vehicules/{vid}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == vid
        assert data["make"] == "Ford"
        assert data["model"] == "Focus"
        assert float(data["prix"]) == 22500.0


def test_get_vehicle_inexistant_404() -> None:
    """GET /vehicules/999999 retourne 404."""
    with TestClient(application) as client:
        resp = client.get("/api/v1/vehicules/999999")
        assert resp.status_code == 404


# ── US-05-01 : Création véhicule (gestionnaire) ────────────────────────────────

def test_create_vehicle_as_gestionnaire() -> None:
    """POST /vehicules/creer crée un véhicule et le retourne (gestionnaire)."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest"))
            token = staff_cookie(gestionnaire)
        finally:
            db.close()

        payload = {
            "make": "Skoda",
            "model": "Fabia",
            "year": 2023,
            "km": 5000,
            "moteur": "Essence",
            "prix": 19500.0,
            "lld": False,
            "img": "https://example.com/fabia.jpg",
            "spec_carburant": "Essence",
            "spec_boite": "Automatique",
            "spec_couleur": "Rouge",
            "spec_places": 5,
            "spec_puissance": "95 ch",
            "visible_catalogue": True,
        }
        resp = client.post(
            "/api/v1/vehicules/creer",
            json=payload,
            cookies={"access_token": token},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert "reference" in data


def test_create_vehicle_refused_as_client() -> None:
    """POST /vehicules/creer retourne 403 pour un simple client."""
    with TestClient(application) as client:
        email = unique_email("cl")
        token = register_and_login(client, email)

        payload = {
            "make": "Test", "model": "Car", "year": 2020, "km": 1000,
            "moteur": "Essence", "prix": 10000.0, "lld": False,
            "img": "https://example.com/car.jpg", "spec_carburant": "Essence",
            "spec_boite": "Manuelle", "spec_couleur": "Bleu", "spec_places": 5,
            "spec_puissance": "80 ch", "visible_catalogue": True,
        }
        resp = client.post(
            "/api/v1/vehicules/creer",
            json=payload,
            cookies={"access_token": token},
        )
        assert resp.status_code == 403


def test_create_vehicle_unauthenticated_401() -> None:
    """POST /vehicules/creer sans cookie retourne 401."""
    with TestClient(application) as client:
        payload = {
            "make": "Test", "model": "Car", "year": 2020, "km": 1000,
            "moteur": "Essence", "prix": 10000.0, "lld": False,
            "img": "https://example.com/car.jpg", "spec_carburant": "Essence",
            "spec_boite": "Manuelle", "spec_couleur": "Bleu", "spec_places": 5,
            "spec_puissance": "80 ch", "visible_catalogue": True,
        }
        resp = client.post("/api/v1/vehicules/creer", json=payload)
        assert resp.status_code == 401


# ── US-05-xx : Back-office liste véhicules ────────────────────────────────────

def test_backoffice_list_vehicles_as_gestionnaire() -> None:
    """GET /vehicules/backoffice retourne les véhicules pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_bo"))
            token = staff_cookie(gestionnaire)
            create_vehicle_in_db(db, make="Volvo", model="XC60")
        finally:
            db.close()

        resp = client.get(
            "/api/v1/vehicules/backoffice",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


def test_backoffice_list_vehicles_refused_as_client() -> None:
    """GET /vehicules/backoffice retourne 403 pour un client."""
    with TestClient(application) as client:
        email = unique_email("cl_bo")
        token = register_and_login(client, email)
        resp = client.get(
            "/api/v1/vehicules/backoffice",
            cookies={"access_token": token},
        )
        assert resp.status_code == 403
