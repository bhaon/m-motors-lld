"""Catalogue métier des options LLD : état dossier, éligibilité édition (US-07-01 / 02 / US-06-08)."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from typing import Literal, cast

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.lld_option_catalog import LldOptionCatalog
from app.models.option_lld import OptionLld
from app.services.lld_catalog_data import (
    ensure_lld_catalog_seeded,
    get_current_price_ht,
    is_lld_option_enabled,
    list_catalog_codes_ordered,
)

LldEditContext = Literal["brouillon", "contrat_actif", "readonly"]


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
    if dossier.type != DossierTypeEnum.lld or dossier.status not in (
        DossierStatusEnum.valide,
        DossierStatusEnum.attente_livraison,
        DossierStatusEnum.livraison_planifiee,
        DossierStatusEnum.contrat_en_cours,
    ):
        return False
    t = today or date.today()
    date_fin: date | None = None
    if dossier.date_debut_contrat and dossier.duree_mois:
        date_fin = _add_months(dossier.date_debut_contrat, dossier.duree_mois)
    return date_fin is None or date_fin >= t


def ensure_option_rows_for_lld_dossier(db: Session, dossier: Dossier) -> None:
    """Crée les lignes ``options_lld`` manquantes pour chaque code catalogue (idempotent, sans ``commit``)."""
    if dossier.type != DossierTypeEnum.lld:
        return
    ensure_lld_catalog_seeded(db)
    codes = {r.code for r in db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()}
    for code in list_catalog_codes_ordered(db):
        if code in codes:
            continue
        db.add(
            OptionLld(
                dossier_id=dossier.id,
                code=code,
                selected=False,
                surcout_mensuel_ht=get_current_price_ht(db, code),
            )
        )
    db.flush()


def pending_unsigned_lld_avenant(db: Session, dossier_id: int):
    """Retourne l’avenant non signé le plus récent, s’il existe (US-06-08)."""
    from app.models.lld_avenant import LldAvenant

    return (
        db.query(LldAvenant)
        .filter(LldAvenant.dossier_id == dossier_id, LldAvenant.signed_at.is_(None))
        .order_by(LldAvenant.created_at.desc())
        .first()
    )


def dossier_allows_lld_option_edit(db: Session, dossier: Dossier) -> bool:
    """US-07-01 : brouillon ; US-07-02 : contrat LLD actif ; US-06-08 : pas d’avenant en attente de signature."""
    if dossier.type != DossierTypeEnum.lld:
        return False
    if dossier.status == DossierStatusEnum.brouillon:
        return True
    if dossier.status in (
        DossierStatusEnum.valide,
        DossierStatusEnum.attente_livraison,
        DossierStatusEnum.livraison_planifiee,
        DossierStatusEnum.contrat_en_cours,
    ) and contrat_lld_est_actif(dossier):
        if dossier.status == DossierStatusEnum.contrat_en_cours and pending_unsigned_lld_avenant(db, dossier.id):
            return False
        return True
    return False


def lld_option_edit_context(db: Session, dossier: Dossier) -> LldEditContext:
    """Contexte d’édition pour l’UI (libellés et parcours)."""
    if not dossier_allows_lld_option_edit(db, dossier):
        return "readonly"
    if dossier.status == DossierStatusEnum.brouillon:
        return "brouillon"
    return "contrat_actif"


def validate_selection_keys(db: Session, selections: dict[str, bool]) -> None:
    """Lève ValueError si une clé n’existe pas dans le catalogue."""
    ensure_lld_catalog_seeded(db)
    known = set(list_catalog_codes_ordered(db))
    unknown = set(selections) - known
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
    pending_avenant_signature: bool = False
    proposed_total_mensualite_ht: float | None = None
    avenant_reference: str | None = None


def merge_lld_selections_from_payload(
    db: Session, dossier: Dossier, payload: dict[str, bool]
) -> dict[str, bool]:
    """Fusionne le PATCH client avec l’état courant pour tous les codes catalogue activés."""
    ensure_lld_catalog_seeded(db)
    ensure_option_rows_for_lld_dossier(db, dossier)
    rows_list = db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()
    rows_by_code = {r.code: r for r in rows_list}
    merged: dict[str, bool] = {}
    for code in list_catalog_codes_ordered(db):
        if not is_lld_option_enabled(db, code):
            continue
        if code in payload:
            merged[code] = bool(payload[code])
        elif code in rows_by_code:
            merged[code] = bool(rows_by_code[code].selected)
        else:
            merged[code] = False
    return merged


def selections_differ_from_rows(merged: dict[str, bool], rows_by_code: dict[str, OptionLld]) -> bool:
    """Vrai si au moins une case diffère des lignes ``OptionLld``."""
    for code, sel in merged.items():
        row = rows_by_code.get(code)
        cur = bool(row.selected) if row else False
        if cur != bool(sel):
            return True
    return False


def compute_lld_options_state_from_selections(
    db: Session, dossier: Dossier, selections: dict[str, bool]
) -> LldOptionsState | None:
    """Calcule totaux et lignes pour un dictionnaire de sélections (ex. avenant proposé, US-06-08)."""
    if dossier.type != DossierTypeEnum.lld:
        return None
    ensure_lld_catalog_seeded(db)
    ensure_option_rows_for_lld_dossier(db, dossier)
    rows_list = db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()
    rows_by_code = {r.code: r for r in rows_list}
    labels: dict[str, tuple[str, str]] = {
        r.code: (r.label, r.description) for r in db.query(LldOptionCatalog).all()
    }
    items: list[dict[str, object]] = []
    for code in list_catalog_codes_ordered(db):
        if not is_lld_option_enabled(db, code):
            continue
        lb = labels.get(code)
        if not lb:
            continue
        row = rows_by_code.get(code)
        surcout = float(row.surcout_mensuel_ht) if row else float(get_current_price_ht(db, code))
        sel = bool(selections.get(code, row.selected if row else False))
        items.append(
            {
                "code": code,
                "label": lb[0],
                "description": lb[1],
                "surcout_mensuel_ht": surcout,
                "selected": sel,
            }
        )
    supplement = sum(
        float(cast(float | int | str, i["surcout_mensuel_ht"]))
        for i in items
        if bool(i["selected"])
    )
    base = float(dossier.vehicle.mensualite) if dossier.vehicle and dossier.vehicle.mensualite is not None else None
    total = (base if base is not None else 0.0) + supplement
    return LldOptionsState(
        base_mensualite_ht=base,
        options_supplement_ht=supplement,
        total_mensualite_ht=total,
        editable=False,
        edit_context="readonly",
        items=items,
    )


def build_lld_options_state(db: Session, dossier: Dossier) -> LldOptionsState | None:
    """Construit l'état des options LLD pour un dossier (``None`` si ce n'est pas un dossier LLD)."""
    if dossier.type != DossierTypeEnum.lld:
        return None
    ensure_lld_catalog_seeded(db)
    ensure_option_rows_for_lld_dossier(db, dossier)
    rows_list = db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()
    rows_by_code = {r.code: r for r in rows_list}
    labels: dict[str, tuple[str, str]] = {
        r.code: (r.label, r.description)
        for r in db.query(LldOptionCatalog).all()
    }
    items: list[dict[str, object]] = []
    for code in list_catalog_codes_ordered(db):
        if not is_lld_option_enabled(db, code):
            continue
        lb = labels.get(code)
        if not lb:
            continue
        row = rows_by_code.get(code)
        surcout = float(row.surcout_mensuel_ht) if row else float(get_current_price_ht(db, code))
        items.append(
            {
                "code": code,
                "label": lb[0],
                "description": lb[1],
                "surcout_mensuel_ht": surcout,
                "selected": bool(row.selected) if row else False,
            }
        )
    supplement = sum(
        float(cast(float | int | str, i["surcout_mensuel_ht"]))
        for i in items
        if bool(i["selected"])
    )
    base = float(dossier.vehicle.mensualite) if dossier.vehicle and dossier.vehicle.mensualite is not None else None
    total = (base if base is not None else 0.0) + supplement
    editable = dossier_allows_lld_option_edit(db, dossier)
    pending = pending_unsigned_lld_avenant(db, dossier.id)
    proposed_total: float | None = None
    avenant_ref: str | None = None
    if pending and isinstance(pending.selections, dict):
        st_prop = compute_lld_options_state_from_selections(
            db, dossier, {str(k): bool(v) for k, v in pending.selections.items()}
        )
        proposed_total = st_prop.total_mensualite_ht if st_prop else None
        avenant_ref = pending.reference
    return LldOptionsState(
        base_mensualite_ht=base,
        options_supplement_ht=supplement,
        total_mensualite_ht=total,
        editable=editable,
        edit_context=lld_option_edit_context(db, dossier),
        items=items,
        pending_avenant_signature=pending is not None,
        proposed_total_mensualite_ht=proposed_total,
        avenant_reference=avenant_ref,
    )


def list_merged_selections_for_storage(merged: dict[str, bool]) -> dict[str, bool]:
    """Normalise les booléens pour stockage JSON (avenant)."""
    return {str(k): bool(v) for k, v in merged.items()}
