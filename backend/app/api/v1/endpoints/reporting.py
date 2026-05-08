"""Endpoints de reporting — réservés aux superviseurs et administrateurs (US-11-03)."""

from __future__ import annotations

from fastapi import APIRouter, Cookie

from sqlalchemy import func

from app.core.deps import DbSession, enforce_role, get_user_from_cookie
from app.models.dossier import Dossier
from app.models.user import RoleEnum, User
from app.schemas.admin import ReportingSummaryOut

router = APIRouter(prefix="/reporting", tags=["Reporting"])


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
