"""Endpoints back-office — gestion du catalogue options LLD (US-07-03)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status

from app.core.deps import DbSession, GestionnaireMultiAuth
from app.models.feature_flag import FeatureFlag
from app.models.lld_option_catalog import LldOptionCatalog, LldOptionPriceHistory
from app.schemas.lld_catalog import (
    LldCatalogActivationIn,
    LldCatalogItemBoOut,
    LldCatalogListOut,
    LldCatalogPatchIn,
    LldCatalogPriceIn,
    LldPriceHistoryItemOut,
    LldPriceHistoryListOut,
)
from app.services.lld_catalog_data import (
    ensure_lld_catalog_seeded,
    get_current_price_ht,
    is_lld_option_enabled,
    lld_option_enabled_flag_key,
    list_catalog_codes_ordered,
    set_lld_option_enabled,
)

router = APIRouter(prefix="/backoffice/lld-catalog", tags=["Catalogue LLD (back-office)"])


def _get_catalog_row(db: DbSession, code: str) -> LldOptionCatalog:
    """Retourne la ligne catalogue ou lève 404."""
    row = db.query(LldOptionCatalog).filter(LldOptionCatalog.code == code).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option catalogue inconnue.")
    return row


def _item_bo_out(db: DbSession, code: str) -> LldCatalogItemBoOut:
    """Construit la vue BO pour un code."""
    cat = _get_catalog_row(db, code)
    ff = db.query(FeatureFlag).filter(FeatureFlag.key == lld_option_enabled_flag_key(code)).first()
    return LldCatalogItemBoOut(
        code=cat.code,
        label=cat.label,
        description=cat.description,
        enabled=is_lld_option_enabled(db, code),
        surcout_mensuel_ht=float(get_current_price_ht(db, code)),
        flag_updated_at=ff.updated_at if ff else None,
    )


@router.get("", response_model=LldCatalogListOut, summary="US-07-03 — Liste du catalogue LLD")
def list_lld_catalog_backoffice(
    db: DbSession,
    _user: GestionnaireMultiAuth,
) -> LldCatalogListOut:
    """Catalogue complet avec prix courant et état d’activation (feature flags)."""
    ensure_lld_catalog_seeded(db)
    items = [_item_bo_out(db, code) for code in list_catalog_codes_ordered(db)]
    return LldCatalogListOut(items=items)


@router.patch("/{code}", response_model=LldCatalogItemBoOut, summary="Mettre à jour libellé / description")
def patch_lld_catalog_entry(
    code: str,
    payload: LldCatalogPatchIn,
    db: DbSession,
    _user: GestionnaireMultiAuth,
) -> LldCatalogItemBoOut:
    """Modifie le texte affiché aux clients (prix inchangé)."""
    ensure_lld_catalog_seeded(db)
    cat = _get_catalog_row(db, code)
    if payload.label is None and payload.description is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fournir au moins `label` ou `description`.",
        )
    if payload.label is not None:
        cat.label = payload.label
    if payload.description is not None:
        cat.description = payload.description
    db.commit()
    db.refresh(cat)
    return _item_bo_out(db, code)


@router.put("/{code}/activation", response_model=LldCatalogItemBoOut, summary="Activer / désactiver une option")
def put_lld_catalog_activation(
    code: str,
    payload: LldCatalogActivationIn,
    db: DbSession,
    _user: GestionnaireMultiAuth,
) -> LldCatalogItemBoOut:
    """Active ou désactive l’option via feature flag (sans colonne sur ``options_lld``)."""
    ensure_lld_catalog_seeded(db)
    _get_catalog_row(db, code)
    set_lld_option_enabled(db, code=code, enabled=payload.enabled)
    db.commit()
    return _item_bo_out(db, code)


@router.post("/{code}/price", response_model=LldCatalogItemBoOut, summary="Enregistrer un nouveau tarif")
def post_lld_catalog_price(
    code: str,
    payload: LldCatalogPriceIn,
    db: DbSession,
    user: GestionnaireMultiAuth,
) -> LldCatalogItemBoOut:
    """Ajoute une ligne d’historique ; les dossiers existants conservent leur tarif contractuel sur les lignes ``options_lld``."""
    ensure_lld_catalog_seeded(db)
    _get_catalog_row(db, code)
    db.add(
        LldOptionPriceHistory(
            option_code=code,
            price_ht=Decimal(str(round(payload.surcout_mensuel_ht, 2))),
            valid_from=datetime.now(timezone.utc),
            created_by_user_id=user.id,
        )
    )
    db.commit()
    return _item_bo_out(db, code)


@router.get("/{code}/price-history", response_model=LldPriceHistoryListOut, summary="Historique des tarifs")
def get_lld_catalog_price_history(
    code: str,
    db: DbSession,
    _user: GestionnaireMultiAuth,
) -> LldPriceHistoryListOut:
    """Liste chronologique décroissante des montants enregistrés pour une option."""
    ensure_lld_catalog_seeded(db)
    _get_catalog_row(db, code)
    rows = (
        db.query(LldOptionPriceHistory)
        .filter(LldOptionPriceHistory.option_code == code)
        .order_by(LldOptionPriceHistory.valid_from.desc(), LldOptionPriceHistory.id.desc())
        .all()
    )
    return LldPriceHistoryListOut(
        option_code=code,
        history=[
            LldPriceHistoryItemOut(
                id=r.id,
                price_ht=float(r.price_ht),
                valid_from=r.valid_from,
                created_by_user_id=r.created_by_user_id,
            )
            for r in rows
        ],
    )
