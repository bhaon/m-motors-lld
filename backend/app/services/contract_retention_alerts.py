"""Alertes email superviseur — fin de contrat LLD à 3 mois (US-06-11)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum, User
from app.services.emailing import send_contract_retention_alert_email
from app.services.lld_dossier_lifecycle import (
    _date_fin_contrat,
    close_expired_lld_contract_dossiers,
    fin_contrat_dans_3_mois,
    jours_restants_contrat,
)

logger = logging.getLogger(__name__)


def _supervisor_recipient_emails(db: Session) -> list[str]:
    """Emails des superviseurs et administrateurs actifs."""
    rows = (
        db.query(User)
        .filter(
            User.role.in_((RoleEnum.superviseur, RoleEnum.admin)),
            User.deleted_at.is_(None),
            User.is_active.is_(True),
        )
        .all()
    )
    return sorted({u.email for u in rows if u.email})


def process_contract_retention_alerts(
    db: Session,
    *,
    now: datetime | None = None,
) -> int:
    """
    Envoie une alerte par contrat dont la fin est dans les 90 jours,
    une seule fois (``retention_alert_sent_at``).
    """
    effective_now = (
        now if now is not None and now.tzinfo is not None else datetime.now(timezone.utc)
    )
    today = effective_now.date()
    close_expired_lld_contract_dossiers(db, today=today)
    recipients = _supervisor_recipient_emails(db)
    if not recipients:
        logger.warning("Aucun superviseur/admin pour les alertes rétention US-06-11")
        return 0

    dashboard_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/backoffice/contrats-en-cours"
    candidates = (
        db.query(Dossier)
        .options(joinedload(Dossier.client))
        .filter(
            Dossier.type == DossierTypeEnum.lld,
            Dossier.status == DossierStatusEnum.contrat_en_cours,
            Dossier.retention_alert_sent_at.is_(None),
        )
        .all()
    )

    sent_count = 0
    for dossier in candidates:
        if not fin_contrat_dans_3_mois(dossier, today=today):
            continue
        fin = _date_fin_contrat(dossier)
        jours = jours_restants_contrat(dossier, today=today)
        if fin is None or jours is None:
            continue
        client = dossier.client
        client_label = (
            f"{client.first_name} {client.last_name}".strip() if client else "Client"
        )
        if not send_contract_retention_alert_email(
            to_emails=recipients,
            dossier_reference=dossier.reference,
            client_label=client_label,
            date_fin_iso=fin.isoformat(),
            jours_restants=jours,
            dashboard_url=dashboard_url,
        ):
            continue
        dossier.retention_alert_sent_at = effective_now
        db.commit()
        sent_count += 1
    return sent_count
