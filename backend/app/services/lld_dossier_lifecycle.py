"""Transitions automatiques des dossiers LLD (fin de contrat → clôturé)."""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum


def _add_months(d: date, months: int) -> date:
    """Aligné sur ``lld_options_catalog._add_months`` / ``list_my_contrats``."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def _date_fin_contrat(dossier: Dossier) -> date | None:
    """Date de fin théorique du LLD si début et durée connus."""
    if dossier.date_debut_contrat is None or dossier.duree_mois is None:
        return None
    return _add_months(dossier.date_debut_contrat, dossier.duree_mois)


def close_expired_lld_contract_dossiers(db: Session) -> int:
    """Passe en ``cloture`` les dossiers LLD ``contrat_en_cours`` dont la date de fin est passée.

    Idempotent ; ne notifie pas par email (passage automatique, trace en historique).
    À appeler en tête des lectures client / listes pour matérialiser l'échéance sans cron.
    """
    today = date.today()
    rows = (
        db.query(Dossier)
        .filter(
            Dossier.status == DossierStatusEnum.contrat_en_cours,
            Dossier.type == DossierTypeEnum.lld,
        )
        .all()
    )
    n = 0
    for d in rows:
        fin = _date_fin_contrat(d)
        if fin is None:
            continue
        if today > fin:
            old = d.status.value
            d.status = DossierStatusEnum.cloture
            db.add(
                DossierHistorique(
                    dossier_id=d.id,
                    ancien_status=old,
                    nouveau_status=DossierStatusEnum.cloture.value,
                    commentaire="Fin du contrat LLD atteinte — dossier clôturé automatiquement.",
                    operateur_id=None,
                )
            )
            n += 1
    if n:
        db.flush()
    return n
