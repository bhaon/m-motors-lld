"""Transitions automatiques des dossiers LLD (fin de contrat → clôturé) et phases de location."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum

LocationPhase = Literal["year1", "year2", "year3"]
RETENTION_ALERT_DAYS = 90


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


def months_elapsed_since(start: date, ref: date) -> int:
    """Nombre de mois civils complets écoulés entre ``start`` et ``ref``."""
    months = (ref.year - start.year) * 12 + ref.month - start.month
    if ref.day < start.day:
        months -= 1
    return max(0, months)


def compute_location_phase(
    dossier: Dossier,
    *,
    today: date | None = None,
) -> LocationPhase | None:
    """Phase visuelle : 1ère / 2ème / dernière année de location (tiers de ``duree_mois``)."""
    if dossier.date_debut_contrat is None or dossier.duree_mois is None or dossier.duree_mois < 1:
        return None
    ref = today or date.today()
    elapsed = months_elapsed_since(dossier.date_debut_contrat, ref)
    year_len = max(1, dossier.duree_mois // 3)
    if elapsed < year_len:
        return "year1"
    if elapsed < year_len * 2:
        return "year2"
    return "year3"


def fin_contrat_dans_3_mois(dossier: Dossier, *, today: date | None = None) -> bool:
    """Vrai si la date de fin est dans les 90 prochains jours (inclus)."""
    fin = _date_fin_contrat(dossier)
    if fin is None:
        return False
    ref = today or date.today()
    jours = (fin - ref).days
    return 0 <= jours <= RETENTION_ALERT_DAYS


def jours_restants_contrat(dossier: Dossier, *, today: date | None = None) -> int | None:
    """Jours restants avant la fin théorique ; ``None`` si dates inconnues."""
    fin = _date_fin_contrat(dossier)
    if fin is None:
        return None
    return (fin - (today or date.today())).days


def close_expired_lld_contract_dossiers(db: Session, *, today: date | None = None) -> int:
    """Passe en ``cloture`` les dossiers LLD ``contrat_en_cours`` dont la date de fin est passée.

    Idempotent ; ne notifie pas par email (passage automatique, trace en historique).
    À appeler en tête des lectures client / listes pour matérialiser l'échéance sans cron.
    """
    ref = today or date.today()
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
        if ref > fin:
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
