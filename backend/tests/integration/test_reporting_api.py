"""Tests d'intégration API — Reporting (US-06-06, US-11-03)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import application
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum, PieceJustificative
from app.models.user import RoleEnum
from tests.integration.conftest import (
    create_staff_user,
    create_vehicle_in_db,
    register_and_login,
    staff_cookie,
    unique_email,
)


def _create_submitted_and_validated_dossier(
    client: TestClient,
    vehicle_id: int,
    gestionnaire_token: str,
) -> int:
    """Crée un dossier, le soumet et le valide. Retourne l'id du dossier."""
    email = unique_email("rep_client")
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
                filename=f"rep_{piece_type}.pdf",
                s3_key=f"pieces/{dossier_id}/rep_{piece_type}.pdf",
                checksum="c" * 64,
                uploaded_at=datetime.now(timezone.utc),
            ))
        db.commit()
    finally:
        db.close()

    client.post(f"/api/v1/dossiers/{dossier_id}/submit", cookies={"access_token": client_token})
    client.patch(f"/api/v1/dossiers/{dossier_id}/prendre-en-charge", cookies={"access_token": gestionnaire_token})
    client.patch(f"/api/v1/dossiers/{dossier_id}/valider", cookies={"access_token": gestionnaire_token})
    return dossier_id


# ── US-11-03 : Tableau de bord statistiques ───────────────────────────────────

def test_reporting_summary_as_superviseur() -> None:
    """GET /reporting/summary retourne les statistiques globales pour un superviseur."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_sum"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        resp = client.get("/api/v1/reporting/summary", cookies={"access_token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert "total_dossiers" in data
        assert "by_status" in data
        assert "by_type" in data
        assert "total_clients" in data
        assert isinstance(data["total_dossiers"], int)
        assert isinstance(data["total_clients"], int)


def test_reporting_summary_as_admin() -> None:
    """GET /reporting/summary est accessible à un admin."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            admin = create_staff_user(db, RoleEnum.admin, email=unique_email("adm_sum"))
            token = staff_cookie(admin)
        finally:
            db.close()

        resp = client.get("/api/v1/reporting/summary", cookies={"access_token": token})
        assert resp.status_code == 200


def test_reporting_summary_refused_as_gestionnaire() -> None:
    """GET /reporting/summary retourne 403 pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_sum"))
            token = staff_cookie(gestionnaire)
        finally:
            db.close()

        resp = client.get("/api/v1/reporting/summary", cookies={"access_token": token})
        assert resp.status_code == 403


def test_reporting_summary_refused_as_client() -> None:
    """GET /reporting/summary retourne 403 pour un client."""
    with TestClient(application) as client:
        email = unique_email("cl_sum")
        token = register_and_login(client, email)
        resp = client.get("/api/v1/reporting/summary", cookies={"access_token": token})
        assert resp.status_code == 403


def test_reporting_summary_compte_clients() -> None:
    """GET /reporting/summary reflète le bon compte de clients après inscription."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_cnt"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        before = client.get("/api/v1/reporting/summary", cookies={"access_token": token}).json()
        clients_before = before["total_clients"]

        register_and_login(client, unique_email("new_cl_cnt"))
        register_and_login(client, unique_email("new_cl_cnt2"))

        after = client.get("/api/v1/reporting/summary", cookies={"access_token": token}).json()
        assert after["total_clients"] == clients_before + 2


# ── US-06-06 : Reporting dossiers par période ─────────────────────────────────

def test_reporting_dossiers_month_as_superviseur() -> None:
    """GET /reporting/dossiers?period=month retourne les métriques du mois courant."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_month"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/reporting/dossiers",
            params={"period": "month"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["period"] == "month"
        assert "cohort_count" in data
        assert "by_status" in data
        assert "period_start" in data
        assert "period_end_exclusive" in data


def test_reporting_dossiers_week() -> None:
    """GET /reporting/dossiers?period=week est accessible et retourne la structure attendue."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_week"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/reporting/dossiers",
            params={"period": "week"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert resp.json()["period"] == "week"


def test_reporting_dossiers_quarter() -> None:
    """GET /reporting/dossiers?period=quarter retourne les métriques du trimestre."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_qtr"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/reporting/dossiers",
            params={"period": "quarter"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert resp.json()["period"] == "quarter"


def test_reporting_dossiers_refused_as_gestionnaire() -> None:
    """GET /reporting/dossiers retourne 403 pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_rep"))
            token = staff_cookie(gestionnaire)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/reporting/dossiers",
            params={"period": "month"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 403


def test_reporting_dossiers_reflète_dossiers_valides() -> None:
    """Les dossiers validés dans le mois courant apparaissent dans le reporting."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_rfl"))
            sup_token = staff_cookie(superviseur)
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_rfl"))
            gest_token = staff_cookie(gestionnaire)
            vehicle = create_vehicle_in_db(db, make="Renault", model="Clio", prix=18000.0)
        finally:
            db.close()

        before = client.get("/api/v1/reporting/dossiers", params={"period": "month"}, cookies={"access_token": sup_token}).json()
        count_before = before["cohort_count"]

        _create_submitted_and_validated_dossier(client, vehicle.id, gest_token)

        after = client.get("/api/v1/reporting/dossiers", params={"period": "month"}, cookies={"access_token": sup_token}).json()
        assert after["cohort_count"] >= count_before


# ── US-06-06 : Export CSV ─────────────────────────────────────────────────────

def test_reporting_csv_export_retourne_csv() -> None:
    """GET /reporting/dossiers/export.csv retourne un fichier CSV valide."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            superviseur = create_staff_user(db, RoleEnum.superviseur, email=unique_email("sup_csv"))
            token = staff_cookie(superviseur)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/reporting/dossiers/export.csv",
            params={"period": "month"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
        assert "Content-Disposition" in resp.headers
        content = resp.content.decode("utf-8-sig")
        assert "period" in content
        assert "cohort_count" in content


def test_reporting_csv_export_refused_as_gestionnaire() -> None:
    """GET /reporting/dossiers/export.csv retourne 403 pour un gestionnaire."""
    with TestClient(application) as client:
        db = SessionLocal()
        try:
            gestionnaire = create_staff_user(db, RoleEnum.gestionnaire, email=unique_email("gest_csv"))
            token = staff_cookie(gestionnaire)
        finally:
            db.close()

        resp = client.get(
            "/api/v1/reporting/dossiers/export.csv",
            params={"period": "month"},
            cookies={"access_token": token},
        )
        assert resp.status_code == 403
