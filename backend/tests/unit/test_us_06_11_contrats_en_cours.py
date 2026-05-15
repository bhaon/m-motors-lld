"""Tests US-06-11 — Tableau de bord contrats LLD en cours et alertes rétention."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from app.services.contract_retention_alerts import process_contract_retention_alerts
from app.services.lld_dossier_lifecycle import (
    _add_months,
    compute_location_phase,
    fin_contrat_dans_3_mois,
    months_elapsed_since,
)
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


def _cookie(client: TestClient, email: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _sup_headers(client: TestClient, db: Session, email: str = "sup.611@ex.com") -> dict[str, str]:
    create_user(db, role=RoleEnum.superviseur, email=email, password=PASSWORD)
    return _cookie(client, email)


def test_months_elapsed_and_phases() -> None:
    """Phases année 1 / 2 / 3 sur un contrat 36 mois."""
    start = date(2024, 1, 15)
    d = Dossier(
        reference="X",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=1,
        vehicle_id=1,
        date_debut_contrat=start,
        duree_mois=36,
    )
    assert months_elapsed_since(start, date(2024, 6, 1)) == 4
    assert compute_location_phase(d, today=date(2024, 6, 1)) == "year1"
    assert compute_location_phase(d, today=date(2025, 6, 1)) == "year2"
    assert compute_location_phase(d, today=date(2026, 6, 1)) == "year3"


def test_fin_dans_3_mois() -> None:
    """Alerte si la fin (début + duree_mois) est dans les 90 jours — pas en jours fixes."""
    today = date(2026, 5, 15)
    start = date(2023, 5, 15)
    d = Dossier(
        reference="Y",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=1,
        vehicle_id=1,
        date_debut_contrat=start,
        duree_mois=36,
    )
    fin = _add_months(start, 36)
    assert fin == today
    assert fin_contrat_dans_3_mois(d, today=today) is True

    d_loin = Dossier(
        reference="Z",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=1,
        vehicle_id=1,
        date_debut_contrat=date(2024, 1, 1),
        duree_mois=36,
    )
    assert (_add_months(date(2024, 1, 1), 36) - today).days > 90
    assert fin_contrat_dans_3_mois(d_loin, today=today) is False


def test_gestionnaire_forbidden_contrats_en_cours(client: TestClient, db: Session) -> None:
    """Un gestionnaire reçoit 403 sur GET /reporting/contrats-en-cours."""
    create_user(db, role=RoleEnum.gestionnaire, email="gest.611@ex.com", password=PASSWORD)
    headers = _cookie(client, "gest.611@ex.com")
    resp = client.get("/api/v1/reporting/contrats-en-cours", headers=headers)
    assert resp.status_code == 403


def test_superviseur_liste_contrats_en_cours(client: TestClient, db: Session) -> None:
    """Le superviseur voit les contrats actifs avec phase et indicateur fin."""
    cli = create_user(db, email="cli.611@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    debut = date.today() - timedelta(days=400)
    d = Dossier(
        reference="DOS-611-LLD",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=cli.id,
        vehicle_id=veh.id,
        date_debut_contrat=debut,
        duree_mois=36,
    )
    db.add(d)
    db.commit()

    headers = _sup_headers(client, db, "sup.611b@ex.com")
    resp = client.get("/api/v1/reporting/contrats-en-cours", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["reference"] == "DOS-611-LLD"
    assert item["location_phase"] in ("year1", "year2", "year3")
    assert "fin_dans_3_mois" in item
    assert item["client"]["email"] == cli.email


def test_retention_alert_job_idempotent(db: Session) -> None:
    """Le job n'envoie qu'une fois par dossier et notifie les superviseurs."""
    sup = create_user(db, role=RoleEnum.superviseur, email="sup.ret@ex.com", password=PASSWORD)
    cli = create_user(db, email="cli.ret@ex.com", password=PASSWORD)
    veh = create_vehicle(db)
    now = datetime(2026, 5, 15, 12, 0, tzinfo=timezone.utc)
    debut = date(2023, 5, 15)
    assert _add_months(debut, 36) == now.date()
    d = Dossier(
        reference="DOS-RET",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=cli.id,
        vehicle_id=veh.id,
        date_debut_contrat=debut,
        duree_mois=36,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    with patch(
        "app.services.contract_retention_alerts.send_contract_retention_alert_email",
        return_value=True,
    ) as mock_send:
        n1 = process_contract_retention_alerts(db, now=now)
        assert n1 == 1
        mock_send.assert_called_once()
        assert sup.email in mock_send.call_args.kwargs["to_emails"]

        db.refresh(d)
        assert d.retention_alert_sent_at is not None

        n2 = process_contract_retention_alerts(db, now=now)
        assert n2 == 0
        assert mock_send.call_count == 1
