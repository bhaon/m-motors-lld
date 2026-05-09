"""Tests US-06-06 — Reporting synthétique dossiers (superviseur / admin)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.endpoints.reporting import _build_dossier_reporting, _calendar_period_bounds
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


def _cookie(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _sup_headers(client: TestClient, db: Session, email: str = "sup.us06@ex.com") -> dict[str, str]:
    create_user(db, role=RoleEnum.superviseur, email=email, password=PASSWORD)
    return _cookie(client, email)


def test_gestionnaire_forbidden_dossiers_reporting(client: TestClient, db: Session) -> None:
    """Un gestionnaire reçoit 403 sur GET /reporting/dossiers."""
    create_user(db, role=RoleEnum.gestionnaire, email="gest.us06@ex.com", password=PASSWORD)
    headers = _cookie(client, "gest.us06@ex.com")
    resp = client.get("/api/v1/reporting/dossiers?period=month", headers=headers)
    assert resp.status_code == 403


def test_gestionnaire_forbidden_csv_export(client: TestClient, db: Session) -> None:
    """Un gestionnaire reçoit 403 sur l’export CSV."""
    create_user(db, role=RoleEnum.gestionnaire, email="gest.csv@ex.com", password=PASSWORD)
    headers = _cookie(client, "gest.csv@ex.com")
    resp = client.get("/api/v1/reporting/dossiers/export.csv?period=month", headers=headers)
    assert resp.status_code == 403


def test_superviseur_get_dossiers_reporting(client: TestClient, db: Session) -> None:
    """Un superviseur obtient la synthèse avec les champs attendus."""
    headers = _sup_headers(client, db, "sup.ok@ex.com")
    resp = client.get("/api/v1/reporting/dossiers?period=month", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["period"] == "month"
    assert "period_start" in body
    assert "period_end_exclusive" in body
    assert "cohort_count" in body
    assert "by_status" in body
    assert "validation_rate" in body
    assert "avg_processing_days" in body
    for st in ("brouillon", "depose", "en_instruction", "valide", "rejete", "annule"):
        assert st in body["by_status"]


def test_reporting_counts_and_rates(client: TestClient, db: Session) -> None:
    """Compte par statut, taux de validation et délai moyen sur une cohorte contrôlée."""
    headers = _sup_headers(client, db, "sup.metrics@ex.com")
    now = datetime.now(timezone.utc)
    start, end_excl = _calendar_period_bounds("month", now)
    submitted = start + timedelta(hours=2)

    cli = create_user(db, role=RoleEnum.client, email="cli.us06@ex.com")
    v = create_vehicle(db)

    # 2 validés, 1 rejeté → taux = 2/3
    for i, st in enumerate(
        [
            (DossierStatusEnum.valide, "VAL-A", True),
            (DossierStatusEnum.valide, "VAL-B", True),
            (DossierStatusEnum.rejete, "REJ-A", False),
        ]
    ):
        status, ref, is_val = st
        d = Dossier(
            reference=ref,
            type=DossierTypeEnum.achat,
            status=status,
            client_id=cli.id,
            vehicle_id=v.id,
            submitted_at=submitted + timedelta(minutes=i),
            motif_rejet=None if is_val else "x" * 25,
        )
        if is_val:
            d.validated_at = submitted + timedelta(days=2 + i)
        else:
            d.rejected_at = submitted + timedelta(days=4)
        db.add(d)
    db.commit()

    resp = client.get("/api/v1/reporting/dossiers?period=month", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["cohort_count"] >= 3
    assert body["by_status"]["valide"] >= 2
    assert body["by_status"]["rejete"] >= 1
    assert body["validation_rate"] is not None
    assert abs(body["validation_rate"] - (2 / 3)) < 1e-6
    assert body["avg_processing_days"] is not None
    assert body["avg_processing_days"] > 0


def test_export_csv_superviseur(client: TestClient, db: Session) -> None:
    """Export CSV UTF-8 avec BOM et lignes métier."""
    headers = _sup_headers(client, db, "sup.csv@ex.com")
    resp = client.get("/api/v1/reporting/dossiers/export.csv?period=week", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("text/csv")
    raw = resp.content
    assert raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8")
    assert "cohort_count" in text
    assert "validation_rate" in text
    assert "Statut" in text


def test_build_dossier_reporting_validation_rate_none_when_no_soldes(db: Session) -> None:
    """Sans dossier validé ni rejeté, le taux est null."""
    now = datetime(2026, 6, 15, tzinfo=timezone.utc)
    data = _build_dossier_reporting(db, preset="month", now=now)
    assert data.validation_rate is None
