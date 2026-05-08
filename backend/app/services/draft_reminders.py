"""Traitement métier des rappels pour dossiers restés en brouillon (US-03-05)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.dossier import Dossier, DossierStatusEnum
from app.models.user import User
from app.services.emailing import send_draft_reminder_email

logger = logging.getLogger(__name__)


def process_stale_draft_reminders(
    db: Session,
    *,
    now: datetime,
    stale_after_days: int | None = None,
) -> int:
    """
    Sélectionne les dossiers en brouillon créés depuis au moins ``stale_after_days`` jours,
    sans rappel déjà envoyé, et déclenche un email au client puis enregistre ``draft_reminder_sent_at``.
    """
    days = stale_after_days if stale_after_days is not None else settings.DRAFT_REMINDER_AFTER_DAYS
    effective_now = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
    threshold = effective_now - timedelta(days=days)
    mes_dossiers_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/mes-dossiers"

    candidates = (
        db.query(Dossier)
        .options(joinedload(Dossier.client))
        .join(User, Dossier.client_id == User.id)
        .filter(
            Dossier.status == DossierStatusEnum.brouillon,
            Dossier.submitted_at.is_(None),
            Dossier.draft_reminder_sent_at.is_(None),
            Dossier.created_at <= threshold,
            User.deleted_at.is_(None),
        )
        .all()
    )

    sent_count = 0
    for dossier in candidates:
        client = dossier.client
        if client is None or not client.email:
            continue
        if not send_draft_reminder_email(
            to_email=client.email,
            dossier_reference=dossier.reference,
            mes_dossiers_url=mes_dossiers_url,
        ):
            continue
        dossier.draft_reminder_sent_at = effective_now
        db.commit()
        sent_count += 1
    return sent_count
