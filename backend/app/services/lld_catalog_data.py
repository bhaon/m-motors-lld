"""Catalogue LLD piloté par la base (US-07-03) : seed, feature flags, prix courants."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import TypedDict

from sqlalchemy.orm import Session

from app.models.feature_flag import FeatureFlag
from app.models.lld_option_catalog import LldOptionCatalog, LldOptionPriceHistory
from app.models.option_lld import OptionLld


class LldCatalogSeedRow(TypedDict):
    code: str
    label: str
    description: str
    surcout_mensuel_ht: float


# Valeurs initiales alignées sur l’ancien catalogue statique (US-07-01).
DEFAULT_LLD_CATALOG: tuple[LldCatalogSeedRow, ...] = (
    {
        "code": "assurance",
        "label": "Assurance tous risques",
        "description": "Couverture dommages, vol et incendie pour votre véhicule en LLD.",
        "surcout_mensuel_ht": 39.0,
    },
    {
        "code": "assistance",
        "label": "Assistance & dépannage",
        "description": "Dépannage sur site, véhicule de remplacement selon conditions générales.",
        "surcout_mensuel_ht": 9.0,
    },
    {
        "code": "entretien",
        "label": "Entretien & révisions",
        "description": "Révisions périodiques, filtres et fluides prévus au carnet constructeur.",
        "surcout_mensuel_ht": 29.0,
    },
    {
        "code": "controle_technique",
        "label": "Contrôle technique",
        "description": "Prise en charge du passage au contrôle technique obligatoire pendant la durée du contrat.",
        "surcout_mensuel_ht": 5.0,
    },
)


def lld_option_enabled_flag_key(code: str) -> str:
    """Clé feature flag pour l’activation d’une option (hors schéma ``options_lld``)."""
    return f"lld_option.{code}.enabled"


def ensure_lld_catalog_seeded(db: Session) -> None:
    """Insère catalogue, flags et premier tarif si tables vides (tests SQLite ou premier démarrage)."""
    if db.query(LldOptionCatalog).first() is not None:
        return
    now = datetime.now(timezone.utc)
    for row in DEFAULT_LLD_CATALOG:
        db.add(
            LldOptionCatalog(
                code=row["code"],
                label=row["label"],
                description=row["description"],
            )
        )
        db.add(
            LldOptionPriceHistory(
                option_code=row["code"],
                price_ht=Decimal(str(row["surcout_mensuel_ht"])),
                valid_from=now,
                created_by_user_id=None,
            )
        )
        db.add(FeatureFlag(key=lld_option_enabled_flag_key(row["code"]), value_bool=True))
    db.flush()


def get_current_price_ht(db: Session, code: str) -> Decimal:
    """Dernier tarif connu pour un code catalogue."""
    row = (
        db.query(LldOptionPriceHistory)
        .filter(LldOptionPriceHistory.option_code == code)
        .order_by(LldOptionPriceHistory.valid_from.desc(), LldOptionPriceHistory.id.desc())
        .first()
    )
    if row is None:
        raise ValueError(f"Aucun tarif catalogue pour le code {code!r}.")
    return row.price_ht


def is_lld_option_enabled(db: Session, code: str) -> bool:
    """Indique si l’option est proposée aux clients (feature flag, défaut True si absent)."""
    key = lld_option_enabled_flag_key(code)
    ff = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if ff is None:
        return True
    return bool(ff.value_bool)


def list_catalog_codes_ordered(db: Session) -> list[str]:
    """Codes catalogue dans l’ordre métier stable."""
    ensure_lld_catalog_seeded(db)
    order_index = {r["code"]: i for i, r in enumerate(DEFAULT_LLD_CATALOG)}
    rows = db.query(LldOptionCatalog.code).all()
    codes = [r[0] for r in rows]
    codes.sort(key=lambda c: order_index.get(c, 999))
    return codes


def set_lld_option_enabled(
    db: Session,
    *,
    code: str,
    enabled: bool,
) -> None:
    """Met à jour le flag et désélectionne l’option sur tous les dossiers si désactivation."""
    key = lld_option_enabled_flag_key(code)
    ff = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if ff is None:
        db.add(FeatureFlag(key=key, value_bool=enabled))
    else:
        ff.value_bool = enabled
    if not enabled:
        db.query(OptionLld).filter(OptionLld.code == code).update({OptionLld.selected: False})
