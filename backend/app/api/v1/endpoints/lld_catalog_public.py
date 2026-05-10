"""Catalogue LLD lecture seule pour le site public (fiche véhicule)."""

from fastapi import APIRouter

from app.core.deps import DbSession
from app.models.lld_option_catalog import LldOptionCatalog
from app.schemas.lld_catalog import LldStorefrontItemOut, LldStorefrontListOut
from app.services.lld_catalog_data import (
    ensure_lld_catalog_seeded,
    get_current_price_ht,
    is_lld_option_enabled,
    list_catalog_codes_ordered,
)

router = APIRouter(prefix="/lld-catalog", tags=["Catalogue LLD (public)"])


@router.get("", response_model=LldStorefrontListOut, summary="Options LLD catalogue pour affichage catalogue")
def list_lld_catalog_storefront(db: DbSession) -> LldStorefrontListOut:
    """Retourne les options du catalogue avec tarif courant et état d’activation (feature flags)."""
    ensure_lld_catalog_seeded(db)
    items: list[LldStorefrontItemOut] = []
    for code in list_catalog_codes_ordered(db):
        cat = db.query(LldOptionCatalog).filter(LldOptionCatalog.code == code).first()
        if not cat:
            continue
        try:
            price_ht = float(get_current_price_ht(db, code))
        except ValueError:
            price_ht = 0.0
        items.append(
            LldStorefrontItemOut(
                code=code,
                label=cat.label,
                surcout_mensuel_ht=price_ht,
                enabled=is_lld_option_enabled(db, code),
            )
        )
    return LldStorefrontListOut(items=items)
