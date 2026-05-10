"""Génération du markdown d’avenant LLD à partir du gabarit ``avenant.md`` (US-06-08)."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Mapping

from sqlalchemy.orm import Session

from app.models.dossier import Dossier
from app.services.contract_fill import (
    _fmt_date,
    _fmt_money,
    build_contract_placeholder_map,
    build_contract_reference,
)
from app.services.lld_catalog_data import is_lld_option_enabled, list_catalog_codes_ordered
from app.services.lld_options_catalog import compute_lld_options_state_from_selections


_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "avenant.md"
_TVA_RATE = Decimal("0.20")


def _apply_placeholders(template: str, mapping: Mapping[str, str]) -> str:
    """Remplace ``{{CLE}}`` (aligné sur ``contract_fill``)."""

    def repl(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return mapping.get(key, "—")

    return re.sub(r"\{\{([^}]+)\}\}", repl, template)


def _contract_date_signature_fr(dossier: Dossier) -> str:
    """Date de signature du contrat initial ou date de début LLD."""
    if dossier.contrat and dossier.contrat.signed_at:
        return _fmt_date(dossier.contrat.signed_at.date())
    if dossier.date_debut_contrat:
        return _fmt_date(dossier.date_debut_contrat)
    return _fmt_date(date.today())


def build_avenant_placeholder_map(
    db: Session,
    dossier: Dossier,
    *,
    avenant_reference: str,
    avenant_num: int,
    merged_selections: dict[str, bool],
) -> dict[str, str]:
    """Variables du gabarit avenant + champs communs au contrat."""
    contract_ref = build_contract_reference(dossier)
    m = dict(
        build_contract_placeholder_map(db, dossier, contract_ref=contract_ref)
    )
    today = datetime.now(timezone.utc).date()
    st = compute_lld_options_state_from_selections(db, dossier, merged_selections)
    total_ht = float(st.total_mensualite_ht) if st else 0.0
    supplement_ht = float(st.options_supplement_ht) if st else 0.0
    total_ttc = (Decimal(str(total_ht)) * (Decimal("1") + _TVA_RATE)).quantize(Decimal("0.01"))
    supp_ttc = (Decimal(str(supplement_ht)) * (Decimal("1") + _TVA_RATE)).quantize(Decimal("0.01"))
    tva_mens = (Decimal(str(total_ht)) * _TVA_RATE).quantize(Decimal("0.01"))

    nb_services = sum(
        1
        for code in list_catalog_codes_ordered(db)
        if is_lld_option_enabled(db, code) and bool(merged_selections.get(code))
    )

    m["CONTRACT_ID"] = contract_ref
    m["CONTRACT_DATE_SIGNATURE"] = _contract_date_signature_fr(dossier)
    m["AVENANT_ID"] = avenant_reference
    m["AVENANT_NUM"] = str(avenant_num)
    m["AVENANT_DATE_EMISSION"] = _fmt_date(today)
    m["AVENANT_DATE_EFFET"] = _fmt_date(today)
    m["AVENANT_DATE_DEBUT"] = _fmt_date(today)
    m["AVENANT_DATE_SIGNATURE"] = _fmt_date(today)
    m["AVENANT_DUREE"] = str(dossier.duree_mois or 36)
    m["AVENANT_DUREE_FERME"] = str(dossier.duree_mois or 36)
    m["NB_SERVICES"] = str(nb_services)
    m["AVENANT_TOTAL_HT_MOIS"] = _fmt_money(supplement_ht)
    m["AVENANT_TVA_MOIS"] = _fmt_money(float(tva_mens))
    m["AVENANT_TOTAL_TTC_MOIS"] = _fmt_money(float(supp_ttc))
    m["AVENANT_MENSUALITE_GLOBALE_TTC"] = _fmt_money(float(total_ttc))
    m["AVENANT_COUT_TOTAL_TTC"] = _fmt_money(float(supp_ttc))
    base_ht_contrat = float(st.base_mensualite_ht) if st and st.base_mensualite_ht is not None else 0.0
    m["CONTRACT_MENSUALITE_TTC"] = _fmt_money(
        float((Decimal(str(base_ht_contrat)) * (Decimal("1") + _TVA_RATE)).quantize(Decimal("0.01")))
    )
    if dossier.date_debut_contrat and dossier.duree_mois:
        from calendar import monthrange

        d0 = dossier.date_debut_contrat
        mo = dossier.duree_mois
        month = d0.month - 1 + mo
        year = d0.year + month // 12
        month = month % 12 + 1
        day = min(d0.day, monthrange(year, month)[1])
        m["AVENANT_DATE_FIN"] = _fmt_date(date(year, month, day))
    else:
        m["AVENANT_DATE_FIN"] = "—"
    m["NB_EXEMPLAIRES"] = m.get("NB_EXEMPLAIRES", "2")
    m["LIEU_SIGNATURE"] = m.get("LIEU_SIGNATURE", m.get("AGENCE_NOM", "—"))
    m["ANNEE"] = str(today.year)
    return m


def render_avenant_markdown(
    db: Session,
    dossier: Dossier,
    *,
    avenant_reference: str,
    avenant_num: int,
    merged_selections: dict[str, bool],
) -> str:
    """Lit ``avenant.md``, injecte les données et retourne le markdown."""
    if not _TEMPLATE_PATH.is_file():
        raise FileNotFoundError(str(_TEMPLATE_PATH))
    raw = _TEMPLATE_PATH.read_text(encoding="utf-8")
    mapping = build_avenant_placeholder_map(
        db,
        dossier,
        avenant_reference=avenant_reference,
        avenant_num=avenant_num,
        merged_selections=merged_selections,
    )
    return _apply_placeholders(raw, mapping)
