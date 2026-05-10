"""Schémas API — catalogue LLD back-office (US-07-03)."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class LldCatalogItemBoOut(BaseModel):
    """Une option telle qu’affichée dans le back-office."""

    model_config = ConfigDict(from_attributes=True)

    code: str
    label: str
    description: str
    enabled: bool
    surcout_mensuel_ht: float
    flag_updated_at: datetime | None = None


class LldCatalogListOut(BaseModel):
    """Liste du catalogue pour la page de gestion."""

    items: list[LldCatalogItemBoOut]


class LldCatalogPatchIn(BaseModel):
    """Mise à jour textuelle (libellé / description)."""

    label: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1)

    @field_validator("label", "description", mode="before")
    @classmethod
    def strip_nonempty(cls, v: object) -> object:
        if v is None or not isinstance(v, str):
            return v
        s = v.strip()
        return s if s else None


class LldCatalogActivationIn(BaseModel):
    """Activation / désactivation via feature flag (sans colonne sur ``options_lld``)."""

    enabled: bool


class LldCatalogPriceIn(BaseModel):
    """Nouveau tarif mensuel HT — crée une ligne d’historique."""

    surcout_mensuel_ht: float = Field(..., gt=0, le=999_999.99)


class LldPriceHistoryItemOut(BaseModel):
    """Une entrée d’historique de prix."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    price_ht: float
    valid_from: datetime
    created_by_user_id: int | None = None


class LldPriceHistoryListOut(BaseModel):
    """Historique complet pour une option."""

    option_code: str
    history: list[LldPriceHistoryItemOut]
