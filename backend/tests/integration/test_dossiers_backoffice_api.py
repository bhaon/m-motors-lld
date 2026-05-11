"""Tests d'intégration API — Flux back-office dossiers (US-06)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import application
from app.models.dossier import PieceJustificative
from app.models.user import RoleEnum
from tests.integration.conftest import (
    create_staff_user,
    create_vehicle_in_db,
    register_and_login,
    staff_cookie,
    unique_email,
)


def _create_submitted_dossier(client: TestClient, vehicle_id: int) -> tuple[int, str]:
    """Inscrit un client, crée un dossier et le soumet (avec toutes les pièces)."""
    email = unique_email("bo_client")
    client_token = register_and_login(client, email)

    created = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle_id, "type": "achat"},
        cookies={"access_token": client_token},
    )
    assert created.status_code == 201
    dossier_id = created.json()["id"]

    db = SessionLocal()
    try:
        for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
            db.add(PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"fake_{piece_type}.pdf",
                s3_key=f"pieces/{dossier_id}/{piece_type}.pdf",
                checksum="b" * 64,
                uploaded_at=datetime.now(timezone.utc),
            ))
        db.commit()
    finally:
        db.close()

    submit = client.post(
        f"/api/v1/dossiers/{dossier_id}/submit",
        cookies={"access_token": client_token},
    )
    assert submit.status_code == 200
    assert submit.json()["status"] == "depose"
    return dossier_id, client_token


# ── US-06-01 : Tableau de bord gestionnaire ───────────────────────────────────

def test_backoffice_list_dossiers_as_gestionnaire() -> None:
    """GET /dossiers/backoffice retourne les dossiers déposés pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_list"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        resp = client.get(
            "/api/v1/dossiers/backoffice",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data and "total" in data
        ids = [d["id"] for d in data["items"]]
        assert dossier_id in ids


def test_backoffice_list_refused_as_client() -> None:
    """GET /dossiers/backoffice retourne 403 pour un client."""
    with TestClient(application) as client:
        email = unique_email("cl_bo")
        token = register_and_login(client, email)
        resp = client.get("/api/v1/dossiers/backoffice", cookies={"access_token": token})
        assert resp.status_code == 403


def test_backoffice_detail_dossier() -> None:
    """GET /dossiers/backoffice/{id} retourne le détail complet pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_det"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db, make="Fiat", model="500")
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        resp = client.get(
            f"/api/v1/dossiers/backoffice/{dossier_id}",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == dossier_id
        assert "client" in data
        assert "vehicle" in data
        assert "pieces" in data
        assert "historique" in data


# ── US-06-02 : Prise en charge ────────────────────────────────────────────────

def test_prendre_en_charge_passe_en_instruction() -> None:
    """PATCH /{id}/prendre-en-charge passe le dossier déposé à en_instruction."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_pec"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        resp = client.patch(
            f"/api/v1/dossiers/{dossier_id}/prendre-en-charge",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "en_instruction"
        assert data["gestionnaire_id"] is not None


def test_prendre_en_charge_idempotent() -> None:
    """PATCH /{id}/prendre-en-charge est idempotent (même gestionnaire, même dossier)."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_idem"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        r1 = client.patch(f"/api/v1/dossiers/{dossier_id}/prendre-en-charge", cookies={"access_token": token})
        assert r1.status_code == 200

        r2 = client.patch(f"/api/v1/dossiers/{dossier_id}/prendre-en-charge", cookies={"access_token": token})
        assert r2.status_code == 200
        assert r2.json()["status"] == "en_instruction"


def test_prendre_en_charge_refused_as_client() -> None:
    """PATCH /{id}/prendre-en-charge retourne 403 pour un client."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, client_token = _create_submitted_dossier(client, vehicle.id)

        resp = client.patch(
            f"/api/v1/dossiers/{dossier_id}/prendre-en-charge",
            cookies={"access_token": client_token},
        )
        assert resp.status_code == 403


# ── US-06-04 : Validation ─────────────────────────────────────────────────────

def test_valider_dossier_passe_en_signature() -> None:
    """PATCH /{id}/valider passe en_instruction → en_signature et génère le contrat."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_val"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db, make="Volkswagen", model="Golf", prix=29000.0)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        client.patch(f"/api/v1/dossiers/{dossier_id}/prendre-en-charge", cookies={"access_token": token})

        resp = client.patch(f"/api/v1/dossiers/{dossier_id}/valider", cookies={"access_token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "en_signature"
        assert data["validated_at"] is not None


def test_valider_dossier_brouillon_409() -> None:
    """PATCH /{id}/valider sur un dossier brouillon retourne 409."""
    with TestClient(application) as client:
        email = unique_email("val_brouillon")
        client_token = register_and_login(client, email)

        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_v409"))
            gest_token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, cookies={"access_token": client_token})
        dossier_id = created.json()["id"]

        resp = client.patch(f"/api/v1/dossiers/{dossier_id}/valider", cookies={"access_token": gest_token})
        assert resp.status_code == 409


# ── US-06-05 : Rejet ─────────────────────────────────────────────────────────

def test_rejeter_dossier_depose() -> None:
    """PATCH /{id}/rejeter passe un dossier déposé à rejete avec motif obligatoire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_rej"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        resp = client.patch(
            f"/api/v1/dossiers/{dossier_id}/rejeter",
            json={"motif": "Pièces insuffisantes — revenus non justifiés."},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "rejete"
        assert data["motif_rejet"] is not None


def test_rejeter_dossier_sans_motif_422() -> None:
    """PATCH /{id}/rejeter sans motif retourne 422 (champ obligatoire)."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_rno"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)

        resp = client.patch(
            f"/api/v1/dossiers/{dossier_id}/rejeter",
            json={},
            cookies={"access_token": token},
        )
        assert resp.status_code == 422


def test_rejeter_dossier_en_instruction() -> None:
    """PATCH /{id}/rejeter fonctionne sur un dossier en_instruction."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_rinstr"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db)
        finally:
            db.close()

        dossier_id, _ = _create_submitted_dossier(client, vehicle.id)
        client.patch(f"/api/v1/dossiers/{dossier_id}/prendre-en-charge", cookies={"access_token": token})

        resp = client.patch(
            f"/api/v1/dossiers/{dossier_id}/rejeter",
            json={"motif": "Dossier non conforme aux conditions de financement."},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejete"


# ── US-06-03 : Consultation du contrat (après validation) ────────────────────

def test_get_contrat_apres_validation() -> None:
    """GET /dossiers/{id}/contrat retourne le contrat markdown après validation."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_ctr"))
            token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db, make="Renault", model="Megane", prix=24000.0)
        finally:
            db.close()

        dossier_id, client_token = _create_submitted_dossier(client, vehicle.id)
        client.patch(f"/api/v1/dossiers/{dossier_id}/prendre-en-charge", cookies={"access_token": token})
        client.patch(f"/api/v1/dossiers/{dossier_id}/valider", cookies={"access_token": token})

        resp = client.get(f"/api/v1/dossiers/{dossier_id}/contrat", cookies={"access_token": client_token})
        assert resp.status_code == 200
        data = resp.json()
        assert "body_markdown" in data
        assert len(data["body_markdown"]) > 10
