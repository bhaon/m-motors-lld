"""Tableau de bord des contrats LLD en cours pour superviseur (US-06-11)."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session, joinedload

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import User
from app.schemas.dossier import ContratVehicleOut
from app.schemas.reporting import (
    ContratEnCoursClientOut,
    ContratEnCoursItemOut,
    ContratEnCoursListOut,
)
from app.services.lld_dossier_lifecycle import (
    _date_fin_contrat,
    close_expired_lld_contract_dossiers,
    compute_location_phase,
    fin_contrat_dans_3_mois,
    jours_restants_contrat,
)
from app.services.lld_options_catalog import build_lld_options_state


def list_contrats_en_cours(db: Session, *, today: date | None = None) -> ContratEnCoursListOut:
    """Liste tous les dossiers LLD ``contrat_en_cours`` avec phase et indicateurs de fin."""
    ref = today or date.today()
    close_expired_lld_contract_dossiers(db)

    rows = (
        db.query(Dossier)
        .options(
            joinedload(Dossier.client),
            joinedload(Dossier.vehicle),
        )
        .filter(
            Dossier.type == DossierTypeEnum.lld,
            Dossier.status == DossierStatusEnum.contrat_en_cours,
        )
        .all()
    )

    gestionnaire_ids = {d.gestionnaire_id for d in rows if d.gestionnaire_id is not None}
    gestionnaires: dict[int, User] = {}
    if gestionnaire_ids:
        gestionnaires = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(gestionnaire_ids)).all()
        }

    items: list[ContratEnCoursItemOut] = []
    for d in rows:
        phase = compute_location_phase(d, today=ref)
        if phase is None:
            continue
        client = d.client
        if client is None:
            continue
        st_ll = build_lld_options_state(db, d)
        total_m_ht = float(st_ll.total_mensualite_ht) if st_ll else None
        gest = gestionnaires.get(d.gestionnaire_id) if d.gestionnaire_id else None
        date_fin = _date_fin_contrat(d)
        items.append(
            ContratEnCoursItemOut(
                id=d.id,
                reference=d.reference,
                client=ContratEnCoursClientOut(
                    id=client.id,
                    email=client.email,
                    first_name=client.first_name,
                    last_name=client.last_name,
                ),
                vehicle=ContratVehicleOut(
                    make=d.vehicle.make if d.vehicle else "—",
                    model=d.vehicle.model if d.vehicle else "",
                    year=d.vehicle.year if d.vehicle else 0,
                    mensualite=float(d.vehicle.mensualite) if d.vehicle and d.vehicle.mensualite else None,
                ),
                gestionnaire_email=gest.email if gest else None,
                duree_mois=d.duree_mois,
                date_debut=d.date_debut_contrat,
                date_fin=date_fin,
                total_mensualite_ht=total_m_ht,
                location_phase=phase,
                fin_dans_3_mois=fin_contrat_dans_3_mois(d, today=ref),
                jours_restants=jours_restants_contrat(d, today=ref),
            )
        )

    items.sort(
        key=lambda c: (
            not c.fin_dans_3_mois,
            c.jours_restants if c.jours_restants is not None else 99999,
            c.reference,
        )
    )
    return ContratEnCoursListOut(total=len(items), items=items)
