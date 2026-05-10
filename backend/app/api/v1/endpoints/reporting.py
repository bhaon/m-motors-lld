"""Endpoints de reporting — réservés aux superviseurs et administrateurs (US-11-03, US-06-06)."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Query, Response
from sqlalchemy import func

from app.core.deps import DbSession, enforce_role, get_user_from_cookie
from app.models.dossier import Dossier, DossierStatusEnum
from app.models.user import RoleEnum, User
from app.schemas.admin import ReportingSummaryOut
from app.schemas.reporting import DossierReportingOut, ReportingPeriodPreset

router = APIRouter(prefix="/reporting", tags=["Reporting"])


def _calendar_period_bounds(preset: ReportingPeriodPreset, ref: datetime) -> tuple[datetime, datetime]:
    """Calcule [start, end) en UTC pour la période calendaire courante (semaine ISO, mois, trimestre)."""
    ref = ref.astimezone(timezone.utc)
    d = ref.date()
    if preset == "week":
        weekday = d.weekday()
        start_d = d - timedelta(days=weekday)
        start = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
        end = start + timedelta(days=7)
    elif preset == "month":
        start = datetime(d.year, d.month, 1, tzinfo=timezone.utc)
        if d.month == 12:
            end = datetime(d.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(d.year, d.month + 1, 1, tzinfo=timezone.utc)
    else:
        q_start_month = ((d.month - 1) // 3) * 3 + 1
        start = datetime(d.year, q_start_month, 1, tzinfo=timezone.utc)
        if q_start_month == 10:
            end = datetime(d.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(d.year, q_start_month + 3, 1, tzinfo=timezone.utc)
    return start, end


def _build_dossier_reporting(
    db: DbSession,
    *,
    preset: ReportingPeriodPreset,
    now: datetime,
) -> DossierReportingOut:
    """Agrège les métriques dossiers pour les dossiers déposés dans la période [start, end)."""
    period_start, period_end_excl = _calendar_period_bounds(preset, now)

    cohort_filter = (
        Dossier.submitted_at.isnot(None),
        Dossier.submitted_at >= period_start,
        Dossier.submitted_at < period_end_excl,
    )

    status_rows = (
        db.query(Dossier.status, func.count(Dossier.id))
        .filter(*cohort_filter)
        .group_by(Dossier.status)
        .all()
    )
    by_status: dict[str, int] = {s.value: 0 for s in DossierStatusEnum}
    for st, cnt in status_rows:
        by_status[st.value] = int(cnt)

    cohort_count = sum(by_status.values())

    positif_n = (
        by_status.get(DossierStatusEnum.valide.value, 0)
        + by_status.get(DossierStatusEnum.en_signature.value, 0)
        + by_status.get(DossierStatusEnum.attente_livraison.value, 0)
        + by_status.get(DossierStatusEnum.livraison_planifiee.value, 0)
        + by_status.get(DossierStatusEnum.cloture.value, 0)
    )
    rejete_n = by_status.get(DossierStatusEnum.rejete.value, 0)
    soldes = positif_n + rejete_n
    validation_rate: float | None = (positif_n / soldes) if soldes > 0 else None

    deltas_days: list[float] = []
    decided = (
        db.query(Dossier)
        .filter(
            *cohort_filter,
            Dossier.status.in_(
                (
                    DossierStatusEnum.valide,
                    DossierStatusEnum.en_signature,
                    DossierStatusEnum.attente_livraison,
                    DossierStatusEnum.livraison_planifiee,
                    DossierStatusEnum.cloture,
                    DossierStatusEnum.rejete,
                )
            ),
        )
        .all()
    )
    for row in decided:
        if row.submitted_at is None:
            continue
        if row.status in (
            DossierStatusEnum.valide,
            DossierStatusEnum.en_signature,
            DossierStatusEnum.attente_livraison,
            DossierStatusEnum.livraison_planifiee,
            DossierStatusEnum.cloture,
        ) and row.validated_at is not None:
            deltas_days.append((row.validated_at - row.submitted_at).total_seconds() / 86400.0)
        elif row.status == DossierStatusEnum.rejete and row.rejected_at is not None:
            deltas_days.append((row.rejected_at - row.submitted_at).total_seconds() / 86400.0)

    avg_processing_days: float | None = None
    if deltas_days:
        avg_processing_days = sum(deltas_days) / len(deltas_days)

    return DossierReportingOut(
        period=preset,
        period_start=period_start,
        period_end_exclusive=period_end_excl,
        cohort_count=cohort_count,
        by_status=by_status,
        validation_rate=validation_rate,
        avg_processing_days=avg_processing_days,
    )


@router.get("/summary", response_model=ReportingSummaryOut)
def get_reporting_summary(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> ReportingSummaryOut:
    """Tableau de bord statistiques — réservé superviseur et admin (gestionnaire exclu)."""
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.superviseur, RoleEnum.admin)

    status_rows = (
        db.query(Dossier.status, func.count(Dossier.id))
        .group_by(Dossier.status)
        .all()
    )
    by_status: dict[str, int] = {s.value: count for s, count in status_rows}

    type_rows = (
        db.query(Dossier.type, func.count(Dossier.id))
        .group_by(Dossier.type)
        .all()
    )
    by_type: dict[str, int] = {t.value: count for t, count in type_rows}

    total_clients: int = (
        db.query(func.count(User.id))
        .filter(User.role == RoleEnum.client, User.deleted_at.is_(None))
        .scalar()
        or 0
    )

    return ReportingSummaryOut(
        total_dossiers=sum(by_status.values()),
        by_status=by_status,
        by_type=by_type,
        total_clients=total_clients,
    )


@router.get("/dossiers/export.csv", summary="US-06-06 — Export CSV de la synthèse dossiers")
def export_dossiers_reporting_csv(
    db: DbSession,
    period: ReportingPeriodPreset = Query(),
    access_token: str | None = Cookie(default=None),
) -> Response:
    """Exporte les mêmes métriques que GET /reporting/dossiers au format CSV (UTF-8 avec BOM)."""
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.superviseur, RoleEnum.admin)

    data = _build_dossier_reporting(db, preset=period, now=datetime.now(timezone.utc))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Clé", "Valeur"])
    writer.writerow(["period", data.period])
    writer.writerow(["period_start_utc", data.period_start.isoformat()])
    writer.writerow(["period_end_exclusive_utc", data.period_end_exclusive.isoformat()])
    writer.writerow(["cohort_count", data.cohort_count])
    writer.writerow(
        ["validation_rate", "" if data.validation_rate is None else f"{data.validation_rate:.6f}"],
    )
    writer.writerow(
        ["avg_processing_days", "" if data.avg_processing_days is None else f"{data.avg_processing_days:.4f}"],
    )
    writer.writerow([])
    writer.writerow(["Statut", "Nombre"])
    for k, v in sorted(data.by_status.items()):
        writer.writerow([k, v])

    raw = "\ufeff" + buf.getvalue()
    filename = f"reporting-dossiers-{data.period}.csv"
    return Response(
        content=raw.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/dossiers", response_model=DossierReportingOut, summary="US-06-06 — Synthèse dossiers par période")
def get_dossiers_reporting(
    db: DbSession,
    period: ReportingPeriodPreset = Query(description="Fenêtre calendaire : semaine ISO, mois ou trimestre courant."),
    access_token: str | None = Cookie(default=None),
) -> DossierReportingOut:
    """Indicateurs dossiers (statuts, taux de validation, délai moyen) pour une période — superviseur / admin."""
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.superviseur, RoleEnum.admin)

    return _build_dossier_reporting(db, preset=period, now=datetime.now(timezone.utc))
