"""Catalogue métier des options LLD : libellés, descriptions et surcoûts par défaut (US-07-01)."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal, TypedDict

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.option_lld import OptionLld, OptionLldCode

LldEditContext = Literal["brouillon", "contrat_actif", "readonly"]


class LldCatalogEntry(TypedDict):
    """Une entrée du catalogue affichée au client."""

    code: str
    label: str
    description: str
    surcout_mensuel_ht: float


# Ordre d'affichage catalogue.
_LLD_CATALOG: tuple[LldCatalogEntry, ...] = (
    {
        "code": OptionLldCode.assurance.value,
        "label": "Assurance tous risques",
        "description": "Couverture dommages, vol et incendie pour votre véhicule en LLD.",
        "surcout_mensuel_ht": 39.0,
    },
    {
        "code": OptionLldCode.assistance.value,
        "label": "Assistance & dépannage",
        "description": "Dépannage sur site, véhicule de remplacement selon conditions générales.",
        "surcout_mensuel_ht": 9.0,
    },
    {
        "code": OptionLldCode.entretien.value,
        "label": "Entretien & révisions",
        "description": "Révisions périodiques, filtres et fluides prévus au carnet constructeur.",
        "surcout_mensuel_ht": 29.0,
    },
    {
        "code": OptionLldCode.controle_technique.value,
        "label": "Contrôle technique",
        "description": "Prise en charge du passage au contrôle technique obligatoire pendant la durée du contrat.",
        "surcout_mensuel_ht": 5.0,
    },
)

_CODES_ORDER = tuple(e["code"] for e in _LLD_CATALOG)
_SURCOUT_BY_CODE = {e["code"]: Decimal(str(e["surcout_mensuel_ht"])) for e in _LLD_CATALOG}


def _add_months(d: date, months: int) -> date:
    """Ajoute un nombre entier de mois à une date (aligné sur dossiers.list_my_contrats)."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def contrat_lld_est_actif(dossier: Dossier, *, today: date | None = None) -> bool:
    """Indique si le dossier LLD validé correspond à un contrat encore actif (US-07-02).

    Même règle que ``GET /dossiers/contrats`` : sans dates contractuelles, le contrat est
    considéré comme actif ; sinon ``date_fin >= today``.
    """
    if dossier.type != DossierTypeEnum.lld or dossier.status != DossierStatusEnum.valide:
        return False
    t = today or date.today()
    date_fin: date | None = None
    if dossier.date_debut_contrat and dossier.duree_mois:
        date_fin = _add_months(dossier.date_debut_contrat, dossier.duree_mois)
    return date_fin is None or date_fin >= t


def catalog_entries() -> tuple[LldCatalogEntry, ...]:
    """Retourne les quatre options dans l'ordre d'affichage."""
    return _LLD_CATALOG


def ensure_option_rows_for_lld_dossier(db: Session, dossier: Dossier) -> None:
    """Crée les quatre lignes ``options_lld`` si absentes (idempotent, sans ``commit``)."""
    if dossier.type != DossierTypeEnum.lld:
        return
    codes = {r.code for r in db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()}
    for entry in _LLD_CATALOG:
        code = entry["code"]
        if code in codes:
            continue
        db.add(
            OptionLld(
                dossier_id=dossier.id,
                code=code,
                selected=False,
                surcout_mensuel_ht=_SURCOUT_BY_CODE[code],
            )
        )
    db.flush()


def dossier_allows_lld_option_edit(dossier: Dossier) -> bool:
    """US-07-01 : brouillon ; US-07-02 : contrat LLD validé et encore actif."""
    if dossier.type != DossierTypeEnum.lld:
        return False
    if dossier.status == DossierStatusEnum.brouillon:
        return True
    if dossier.status == DossierStatusEnum.valide and contrat_lld_est_actif(dossier):
        return True
    return False


def lld_option_edit_context(dossier: Dossier) -> LldEditContext:
    """Contexte d’édition pour l’UI (libellés et parcours)."""
    if not dossier_allows_lld_option_edit(dossier):
        return "readonly"
    if dossier.status == DossierStatusEnum.brouillon:
        return "brouillon"
    return "contrat_actif"


def validate_selection_keys(selections: dict[str, bool]) -> None:
    """Lève ValueError si une clé est inconnue."""
    unknown = set(selections) - set(_CODES_ORDER)
    if unknown:
        raise ValueError(f"Codes d'option inconnus : {', '.join(sorted(unknown))}")


@dataclass
class LldOptionsState:
    """État agrégé pour l'API et les tests."""

    base_mensualite_ht: float | None
    options_supplement_ht: float
    total_mensualite_ht: float
    editable: bool
    edit_context: LldEditContext
    items: list[dict[str, object]]


def build_lld_options_state(db: Session, dossier: Dossier) -> LldOptionsState | None:
    """Construit l'état des options LLD pour un dossier (``None`` si ce n'est pas un dossier LLD)."""
    if dossier.type != DossierTypeEnum.lld:
        return None
    ensure_option_rows_for_lld_dossier(db, dossier)
    rows_list = db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()
    rows_by_code = {r.code: r for r in rows_list}
    items: list[dict[str, object]] = []
    for e in _LLD_CATALOG:
        row = rows_by_code.get(e["code"])
        surcout = float(row.surcout_mensuel_ht) if row else float(e["surcout_mensuel_ht"])
        items.append(
            {
                "code": e["code"],
                "label": e["label"],
                "description": e["description"],
                "surcout_mensuel_ht": surcout,
                "selected": bool(row.selected) if row else False,
            }
        )
    supplement = sum(float(i["surcout_mensuel_ht"]) for i in items if i["selected"])
    base = float(dossier.vehicle.mensualite) if dossier.vehicle and dossier.vehicle.mensualite is not None else None
    total = (base if base is not None else 0.0) + supplement
    editable = dossier_allows_lld_option_edit(dossier)
    return LldOptionsState(
        base_mensualite_ht=base,
        options_supplement_ht=supplement,
        total_mensualite_ht=total,
        editable=editable,
        edit_context=lld_option_edit_context(dossier),
        items=items,
    )
