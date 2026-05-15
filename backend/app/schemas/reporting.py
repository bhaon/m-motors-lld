"""Schémas pour le reporting dossiers (US-06-06) et contrats en cours (US-06-11)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.dossier import ContratVehicleOut


ReportingPeriodPreset = Literal["week", "month", "quarter"]


class DossierReportingOut(BaseModel):
    """Synthèse dossiers sur une période — superviseur / admin uniquement."""

    period: ReportingPeriodPreset
    period_start: datetime = Field(description="Début de la période (UTC, inclus).")
    period_end_exclusive: datetime = Field(
        description="Fin exclusive de la période (UTC) : intervalle [period_start, period_end_exclusive)."
    )
    cohort_count: int = Field(
        description="Nombre de dossiers avec dépôt (submitted_at) dans l'intervalle.",
    )
    by_status: dict[str, int]
    validation_rate: float | None = Field(
        default=None,
        description="Part des dossiers validés parmi les dossiers soldés (validé + rejeté), même cohorte. 0..1 ou null si aucun soldé.",
    )
    avg_processing_days: float | None = Field(
        default=None,
        description="Délai moyen en jours (dépôt → décision) pour les dossiers validés ou rejetés de la cohorte ayant les timestamps nécessaires.",
    )


LocationPhase = Literal["year1", "year2", "year3"]


class ContratEnCoursClientOut(BaseModel):
    """Client associé à un contrat LLD en cours."""

    id: int
    email: str
    first_name: str
    last_name: str


class ContratEnCoursItemOut(BaseModel):
    """Contrat LLD en cours pour le tableau de bord superviseur."""

    id: int
    reference: str
    client: ContratEnCoursClientOut
    vehicle: ContratVehicleOut
    gestionnaire_email: str | None = None
    duree_mois: int | None = None
    date_debut: date | None = None
    date_fin: date | None = None
    total_mensualite_ht: float | None = None
    location_phase: LocationPhase
    fin_dans_3_mois: bool = False
    jours_restants: int | None = None


class ContratEnCoursListOut(BaseModel):
    """Liste des contrats LLD actifs."""

    total: int
    items: list[ContratEnCoursItemOut]
