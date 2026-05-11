"""
Politique de conservation et purge des données personnelles (RGPD).

Les durées légales exactes dépendent des traitements (comptabilité, litiges, etc.) ;
le DPO valide le calendrier opérationnel. Ce module centralise les seuils configurables
et une purge technique conservatrice (comptes clients sans dossier).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.dossier import Dossier
from app.models.user import RoleEnum, User


def legal_retention_categories() -> dict[str, str]:
    """
    Rappel des grandes catégories de conservation (indicatif, non exhaustif).

    Les valeurs sont des descriptions métier ; les durées précises relèvent du registre
    des traitements et des obligations légales françaises / européennes.
    """
    return {
        "donnees_comptables_facturation": "Conservation au titre des obligations comptables et fiscales (durée fixée par la loi).",
        "contrats_location": "Conservation des pièces contractuelles et des échanges liés au contrat tant que nécessaire à la preuve.",
        "preuve_consentements_rgpd": "Horodatages et traces de consentement pour démontrer la conformité du traitement.",
        "donnees_compte_inactif": "Après exercice du droit à l'effacement (soft delete), délai avant anonymisation / purge selon calendrier DPO.",
    }


def hard_delete_expired_soft_deleted_clients_without_dossiers(db: Session, *, now: datetime | None = None) -> int:
    """
    Supprime définitivement les comptes clients en soft-delete depuis plus de
    ``CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS`` et sans dossier lié.

    Les clients ayant au moins un dossier ne sont pas supprimés ici : la purge PII
    doit être orchestrée avec anonymisation des dossiers et respect des durées légales.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=settings.CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS)
    has_dossier = exists().where(Dossier.client_id == User.id)
    q = (
        db.query(User)
        .filter(
            User.role == RoleEnum.client,
            User.deleted_at.isnot(None),
            User.deleted_at < cutoff,
            ~has_dossier,
        )
    )
    users = q.all()
    n = 0
    for u in users:
        db.delete(u)
        n += 1
    if n:
        db.commit()
    return n
