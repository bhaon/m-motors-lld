"""Génération du markdown du contrat à partir du gabarit et des données dossier (US-06-07)."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Mapping, cast

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierTypeEnum
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.lld_options_catalog import build_lld_options_state

_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "contrat.md"
_TVA_RATE = Decimal("0.20")


def _fmt_date(d: date | None) -> str:
    """Format JJ/MM/AAAA pour les champs date du contrat."""
    if d is None:
        return "—"
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _fmt_money(value: float | Decimal | int | None) -> str:
    """Affichage monétaire simple (sans symbole séparé, le gabarit ajoute €)."""
    if value is None:
        return "—"
    v = float(value)
    if abs(v - int(v)) < 1e-9:
        return str(int(v))
    return f"{v:.2f}".replace(".", ",")


def _build_base_agency_map() -> dict[str, str]:
    """Valeurs d'établissement factices alignées sur le gabarit M-Motors."""
    return {
        "AGENCE_NOM": "Agence Centre",
        "AGENCE_ADRESSE": "12 avenue Factice, 75001 Paris",
        "AGENCE_TEL": "+33 1 23 45 67 89",
        "AGENCE_EMAIL": "contact@mmotors-factice.example",
        "VENDEUR_SIRET": "12345678901234",
        "VENDEUR_TVA": "FR12345678901",
        "VENDEUR_ADRESSE": "45 rue Factice, 75008 Paris",
        "VENDEUR_REPRESENTANT": "Jean Dupont",
        "VENDEUR_QUALITE": "Directeur commercial",
        "VENDEUR_TRIBUNAL": "Paris",
        "VENDEUR_DPO_EMAIL": "dpo@mmotors-factice.example",
    }


def build_contract_placeholder_map(db: Session, dossier: Dossier, *, contract_ref: str) -> dict[str, str]:
    """Assemble les clés `{{NAME}}` du gabarit à partir du dossier, client et véhicule."""
    now = datetime.now(timezone.utc)
    today = now.date()
    client: User | None = dossier.client
    vehicle: Vehicle | None = dossier.vehicle

    m = dict(_build_base_agency_map())
    m["CONTRACT_ID"] = contract_ref
    m["DATE_EMISSION"] = _fmt_date(today)
    m["ANNEE"] = str(today.year)
    m["LIEU_SIGNATURE"] = m["AGENCE_NOM"]
    m["DATE_SIGNATURE"] = _fmt_date(today)
    m["NB_EXEMPLAIRES"] = "2"

    if client:
        m["CLIENT_NOM"] = client.last_name or "—"
        m["CLIENT_PRENOM"] = client.first_name or "—"
        m["CLIENT_EMAIL"] = client.email
        m["CLIENT_TEL"] = client.phone or "—"
        m["CLIENT_DATE_NAISSANCE"] = _fmt_date(client.birth_date)
        m["CLIENT_LIEU_NAISSANCE"] = "—"
        m["CLIENT_CIVILITE"] = "M."
        m["CLIENT_ADRESSE"] = "—"
        m["CLIENT_CP"] = "—"
        m["CLIENT_VILLE"] = "—"
        m["CLIENT_PAYS"] = "France"
        m["CLIENT_PIECE_ID_TYPE"] = "CNI"
        m["CLIENT_PIECE_ID_NUM"] = "—"
        m["CLIENT_PIECE_ID_DATE"] = "—"
        m["CLIENT_PIECE_ID_AUTORITE"] = "—"
    else:
        for key in (
            "CLIENT_NOM",
            "CLIENT_PRENOM",
            "CLIENT_EMAIL",
            "CLIENT_TEL",
            "CLIENT_DATE_NAISSANCE",
            "CLIENT_LIEU_NAISSANCE",
            "CLIENT_CIVILITE",
            "CLIENT_ADRESSE",
            "CLIENT_CP",
            "CLIENT_VILLE",
            "CLIENT_PAYS",
            "CLIENT_PIECE_ID_TYPE",
            "CLIENT_PIECE_ID_NUM",
            "CLIENT_PIECE_ID_DATE",
            "CLIENT_PIECE_ID_AUTORITE",
        ):
            m[key] = "—"

    if vehicle:
        m["VEH_MARQUE"] = vehicle.make
        m["VEH_MODELE"] = vehicle.model
        m["VEH_VERSION"] = f"{vehicle.year}"
        m["VEH_CARROSSERIE"] = "Berline"
        m["VEH_ENERGIE"] = vehicle.spec_carburant or str(vehicle.moteur.value)
        m["VEH_CYLINDREE"] = "—"
        m["VEH_PUISSANCE_FISC"] = vehicle.spec_puissance or "—"
        m["VEH_PUISSANCE_REELLE"] = "—"
        m["VEH_BOITE"] = vehicle.spec_boite
        m["VEH_COULEUR_EXT"] = vehicle.spec_couleur
        m["VEH_COULEUR_INT"] = "—"
        m["VEH_NB_PLACES"] = str(vehicle.spec_places)
        m["VEH_NB_PORTES"] = "5"
        m["VEH_VIN"] = "—"
        m["VEH_IMMAT"] = "—"
        m["VEH_DATE_MEC"] = _fmt_date(date(vehicle.year, 1, 15))
        m["VEH_KM"] = str(vehicle.km)
        m["VEH_COC"] = "—"
        m["VEH_CG"] = "—"
        m["VEH_GENRE"] = "VP"
        m["VEH_NATURE"] = "Occasion"
        m["VEH_ETAT"] = "Bon état général"
        m["VEH_CT_DATE"] = "—"
        m["VEH_CT_RESULTAT"] = "Favorable"
        m["VEH_CARNET_ENTRETIEN"] = "Oui"
        m["VEH_NB_PROPRIO"] = "1"
        prix_ttc = Decimal(str(vehicle.prix))
        prix_ht = (prix_ttc / (Decimal("1") + _TVA_RATE)).quantize(Decimal("0.01"))
        tva_montant = (prix_ttc - prix_ht).quantize(Decimal("0.01"))
        m["PRIX_HT"] = _fmt_money(prix_ht)
        m["TVA_TAUX"] = "20"
        m["TVA_MONTANT"] = _fmt_money(tva_montant)
        m["PRIX_VEH_TTC"] = _fmt_money(prix_ttc)
        m["PRIX_TOTAL_TTC"] = _fmt_money(prix_ttc)

    m["PRIX_OPTIONS_TTC"] = "0"
    m["FRAIS_MER"] = "0"
    m["FRAIS_ADMIN"] = "0"
    m["REMISE"] = "0"
    m["REPRISE_MONTANT"] = "0"
    m["PAIEMENT_MODE"] = "LLD" if dossier.type == DossierTypeEnum.lld else "Comptant"
    m["ACOMPTE_MONTANT"] = "0"
    m["ACOMPTE_DATE"] = "—"
    m["SOLDE_MONTANT"] = "0"
    m["FIN_TYPE"] = "LLD" if dossier.type == DossierTypeEnum.lld else "Crédit classique"
    m["FIN_ORGANISME"] = "M-Motors Finance"
    m["FIN_DUREE"] = str(dossier.duree_mois) if dossier.duree_mois else "48"
    m["FIN_APPORT"] = "0"
    m["FIN_MONTANT"] = m.get("PRIX_VEH_TTC", "—")
    m["FIN_MENSUALITE"] = _fmt_money(vehicle.mensualite) if vehicle and vehicle.mensualite else "—"
    m["FIN_TAEG"] = "—"
    m["FIN_COUT_TOTAL"] = "—"
    m["FIN_VR"] = "—"
    m["REPRISE_MARQUE"] = "—"
    m["REPRISE_MODELE"] = "—"
    m["REPRISE_IMMAT"] = "—"
    m["REPRISE_VIN"] = "—"
    m["REPRISE_KM"] = "—"
    m["LIVRAISON_DATE"] = "—"
    m["LIVRAISON_LIEU"] = m.get("AGENCE_ADRESSE", "—")
    m["NB_CLES"] = "2"
    m["DOCS_COMPLEMENTAIRES"] = "Carnet d'entretien, garantie"
    m["GARANTIE_CONST_DUREE"] = "24"
    m["GARANTIE_CONST_KM"] = "100000"
    m["GARANTIE_CONST_DEBUT"] = _fmt_date(today)
    m["GARANTIE_CONST_FIN"] = _fmt_date(date(today.year + 2, today.month, today.day))
    m["GARANTIE_MMOTORS_DUREE"] = "12"
    m["GARANTIE_MMOTORS_KM"] = "30000"

    state = build_lld_options_state(db, dossier)
    selected_items = [i for i in (state.items if state else []) if bool(i.get("selected"))]
    pool = selected_items if selected_items else (state.items if state else [])[:3]
    for idx in range(1, 4):
        if idx - 1 < len(pool):
            item = pool[idx - 1]
            m[f"OPT_CODE_{idx}"] = str(item.get("code", "—"))
            m[f"OPT_LABEL_{idx}"] = str(item.get("label", "—"))
            m[f"OPT_PRIX_{idx}"] = _fmt_money(cast(float | int | str, item.get("surcout_mensuel_ht", 0)))
        else:
            m[f"OPT_CODE_{idx}"] = "—"
            m[f"OPT_LABEL_{idx}"] = "—"
            m[f"OPT_PRIX_{idx}"] = "—"
    if pool:
        last = pool[-1]
        m["OPT_CODE_N"] = str(last.get("code", "—"))
        m["OPT_LABEL_N"] = str(last.get("label", "—"))
        m["OPT_PRIX_N"] = _fmt_money(cast(float | int | str, last.get("surcout_mensuel_ht", 0)))
    else:
        m["OPT_CODE_N"] = "—"
        m["OPT_LABEL_N"] = "—"
        m["OPT_PRIX_N"] = "—"

    return m


def _apply_placeholders(template: str, mapping: Mapping[str, str]) -> str:
    """Remplace toutes les occurrences `{{CLE}}` ; clé inconnue → tiret cadratin."""

    def repl(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return mapping.get(key, "—")

    return re.sub(r"\{\{([^}]+)\}\}", repl, template)


def render_contract_markdown(db: Session, dossier: Dossier, *, contract_reference: str) -> str:
    """Lit le gabarit, injecte les données et retourne le markdown prêt à stocker."""
    if not _TEMPLATE_PATH.is_file():
        raise FileNotFoundError(str(_TEMPLATE_PATH))
    raw = _TEMPLATE_PATH.read_text(encoding="utf-8")
    mapping = build_contract_placeholder_map(db, dossier, contract_ref=contract_reference)
    return _apply_placeholders(raw, mapping)


def build_contract_reference(dossier: Dossier) -> str:
    """Construit une référence contrat dérivée de la référence dossier (CTR-…)."""
    ref = dossier.reference.replace("DOS-", "CTR-", 1)
    if ref == dossier.reference:
        return f"CTR-{dossier.reference}"
    return ref
