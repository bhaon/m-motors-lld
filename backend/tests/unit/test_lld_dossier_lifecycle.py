"""Transitions automatiques fin de contrat LLD → clôture."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.services.lld_dossier_lifecycle import close_expired_lld_contract_dossiers
from tests.conftest import create_user, create_vehicle


def test_close_expired_lld_passe_en_cloture_apres_date_fin(db: Session) -> None:
    """Un dossier ``contrat_en_cours`` dont la fin de contrat est dépassée devient ``cloture``."""
    cli = create_user(db, email="cli.lc@ex.com")
    veh = create_vehicle(db)
    # Début 2019 + 36 mois → échéance passée (réf. date du jour : mai 2026).
    d0 = date(2019, 1, 1)
    d = Dossier(
        reference="DOS-LC-EXP",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.contrat_en_cours,
        client_id=cli.id,
        vehicle_id=veh.id,
        date_debut_contrat=d0,
        duree_mois=36,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    n = close_expired_lld_contract_dossiers(db)
    assert n == 1
    db.refresh(d)
    assert d.status == DossierStatusEnum.cloture


def test_close_expired_lld_ne_change_pas_si_contrat_encore_actif(db: Session) -> None:
    """Tant que la date de fin n'est pas passée, le statut reste ``contrat_en_cours``."""
    cli = create_user(db, email="cli.lc2@ex.com")
    veh = create_vehicle(db)
    debut = date(2025, 1, 1)
    d = Dossier(
        reference="DOS-LC-OK",
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

    n = close_expired_lld_contract_dossiers(db)
    assert n == 0
    db.refresh(d)
    assert d.status == DossierStatusEnum.contrat_en_cours
