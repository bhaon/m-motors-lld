"""Schémas pour le reporting dossiers (US-06-06)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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
