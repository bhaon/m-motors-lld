"""Tests d'intégration API — Flux client dossiers (US-03, US-04)."""

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


# ── US-03-01 : Création d'un dossier achat ────────────────────────────────────

def test_create_dossier_achat_end_to_end() -> None:
    """Un client crée un dossier achat : 201 avec référence et statut brouillon."""
    with TestClient(application) as client:
        email = unique_email("achat")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db, make="Opel", model="Corsa", lld=False)
        finally:
            db.close()

        resp = client.post(
            "/api/v1/dossiers",
            json={"vehicle_id": vehicle.id, "type": "achat"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "brouillon"
        assert data["type"] == "achat"
        assert data["vehicle_id"] == vehicle.id
        assert data["reference"].startswith("DOS-")


def test_create_dossier_lld_end_to_end() -> None:
    """Un client crée un dossier LLD : 201, statut brouillon, type lld."""
    with TestClient(application) as client:
        email = unique_email("lld")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db, make="Tesla", model="Model 3", lld=True, mensualite=599.0)
        finally:
            db.close()

        resp = client.post(
            "/api/v1/dossiers",
            json={"vehicle_id": vehicle.id, "type": "lld"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "lld"
        assert data["status"] == "brouillon"


def test_create_dossier_lld_vehicle_non_lld_400() -> None:
    """Créer un dossier LLD sur un véhicule non LLD retourne 400."""
    with TestClient(application) as client:
        email = unique_email("lld_ko")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db, lld=False)
        finally:
            db.close()

        resp = client.post(
            "/api/v1/dossiers",
            json={"vehicle_id": vehicle.id, "type": "lld"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 400


def test_create_dossier_vehicle_inexistant_404() -> None:
    """Créer un dossier sur un véhicule inexistant retourne 404."""
    with TestClient(application) as client:
        email = unique_email("v404")
        token = register_and_login(client, email)
        resp = client.post(
            "/api/v1/dossiers",
            json={"vehicle_id": 999999, "type": "achat"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 404


def test_create_dossier_doublon_409() -> None:
    """Créer deux dossiers identiques (même client, même véhicule, même type) retourne 409."""
    with TestClient(application) as client:
        email = unique_email("doublon")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db, make="Seat", model="Ibiza")
        finally:
            db.close()

        payload = {"vehicle_id": vehicle.id, "type": "achat"}
        r1 = client.post("/api/v1/dossiers", json=payload, cookies={"access_token": token})
        assert r1.status_code == 201

        r2 = client.post("/api/v1/dossiers", json=payload, cookies={"access_token": token})
        assert r2.status_code == 409


def test_create_dossier_unauthenticated_401() -> None:
    """Créer un dossier sans cookie retourne 401."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()
        resp = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"})
        assert resp.status_code == 401


# ── US-03-02 : Liste des dossiers du client ───────────────────────────────────

def test_list_my_dossiers_retourne_uniquement_les_siens() -> None:
    """GET /dossiers/me retourne les dossiers du client connecté, pas ceux des autres."""
    with TestClient(application) as client:
        email_a = unique_email("me_a")
        email_b = unique_email("me_b")
        token_a = register_and_login(client, email_a)
        token_b = register_and_login(client, email_b)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token_a})

        resp_a = client.get("/api/v1/dossiers/me", cookies={"access_token": token_a})
        assert resp_a.status_code == 200
        ids_a = [d["id"] for d in resp_a.json()]
        assert len(ids_a) >= 1

        resp_b = client.get("/api/v1/dossiers/me", cookies={"access_token": token_b})
        assert resp_b.status_code == 200
        ids_b = [d["id"] for d in resp_b.json()]
        assert not any(i in ids_b for i in ids_a), "Client B ne doit pas voir les dossiers de A"


def test_list_my_dossiers_contient_info_vehicule() -> None:
    """GET /dossiers/me inclut make/model/year du véhicule."""
    with TestClient(application) as client:
        email = unique_email("me_veh")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db, make="Nissan", model="Micra", year=2020)
        finally:
            db.close()

        client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token})

        resp = client.get("/api/v1/dossiers/me", cookies={"access_token": token})
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        veh_info = items[0]["vehicle"]
        assert veh_info["make"] == "Nissan"
        assert veh_info["model"] == "Micra"
        assert veh_info["year"] == 2020


# ── US-03-03 : Détail d'un dossier ────────────────────────────────────────────

def test_get_dossier_detail_200() -> None:
    """GET /dossiers/{id} retourne le détail complet pour le propriétaire."""
    with TestClient(application) as client:
        email = unique_email("det")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token})
        dossier_id = created.json()["id"]

        resp = client.get(f"/api/v1/dossiers/{dossier_id}", cookies={"access_token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == dossier_id
        assert data["status"] == "brouillon"
        assert "pieces" in data


def test_get_dossier_autre_client_403() -> None:
    """GET /dossiers/{id} retourne 403 si le dossier appartient à un autre client."""
    with TestClient(application) as client:
        email_owner = unique_email("own")
        email_other = unique_email("oth")
        token_owner = register_and_login(client, email_owner)
        token_other = register_and_login(client, email_other)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token_owner})
        dossier_id = created.json()["id"]

        resp = client.get(f"/api/v1/dossiers/{dossier_id}", cookies={"access_token": token_other})
        assert resp.status_code == 403


# ── US-03-04 : Suppression brouillon ─────────────────────────────────────────

def test_delete_dossier_brouillon_204() -> None:
    """DELETE /dossiers/{id} supprime un brouillon et retourne 204."""
    with TestClient(application) as client:
        email = unique_email("del")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token})
        dossier_id = created.json()["id"]

        resp = client.delete(f"/api/v1/dossiers/{dossier_id}", cookies={"access_token": token})
        assert resp.status_code == 204

        get_resp = client.get(f"/api/v1/dossiers/{dossier_id}", cookies={"access_token": token})
        assert get_resp.status_code == 404


# ── US-03-05 : Soumission d'un dossier ────────────────────────────────────────

def test_submit_dossier_sans_pieces_retourne_erreur() -> None:
    """POST /dossiers/{id}/submit sans pièces retourne 422 ou 400 (pièces manquantes)."""
    with TestClient(application) as client:
        email = unique_email("sub_ko")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token})
        dossier_id = created.json()["id"]

        resp = client.post(f"/api/v1/dossiers/{dossier_id}/submit", cookies={"access_token": token})
        assert resp.status_code in (400, 422)


def test_submit_dossier_avec_pieces_retourne_depose() -> None:
    """POST /dossiers/{id}/submit avec toutes les pièces passe le statut à depose."""
    from datetime import datetime, timezone
    from app.models.dossier import Dossier, PieceJustificative

    with TestClient(application) as client:
        email = unique_email("sub_ok")
        token = register_and_login(client, email)

        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": token})
        dossier_id = created.json()["id"]

        db = SessionLocal()
        try:
            for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
                db.add(PieceJustificative(
                    dossier_id=dossier_id,
                    type_piece=piece_type,
                    filename=f"fake_{piece_type}.pdf",
                    s3_key=f"pieces/{dossier_id}/{piece_type}.pdf",
                    checksum="a" * 64,
                    uploaded_at=datetime.now(timezone.utc),
                ))
            db.commit()
        finally:
            db.close()

        resp = client.post(f"/api/v1/dossiers/{dossier_id}/submit", cookies={"access_token": token})
        assert resp.status_code == 200
        assert resp.json()["status"] == "depose"
