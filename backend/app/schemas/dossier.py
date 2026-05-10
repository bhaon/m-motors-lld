from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.dossier import DossierTypeEnum

LldEditContext = Literal["brouillon", "contrat_actif", "readonly"]
PieceType = Literal["cni", "permis", "revenus", "domicile", "rib"]


class DossierCreateIn(BaseModel):
    vehicle_id: int
    type: DossierTypeEnum


class DossierCreateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    type: DossierTypeEnum
    status: str
    vehicle_id: int
    client_id: int
    created_at: datetime | None = None


class VehicleSummaryOut(BaseModel):
    """Résumé véhicule inclus dans le listing du tableau de bord client."""

    make: str
    model: str
    year: int


class DossierListItemOut(BaseModel):
    """Dossier enrichi avec les informations véhicule pour le tableau de bord."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    type: DossierTypeEnum
    status: str
    vehicle_id: int
    client_id: int
    created_at: datetime | None = None
    vehicle: VehicleSummaryOut


class PieceUploadInitIn(BaseModel):
    type_piece: PieceType
    filename: str
    content_type: Literal["application/pdf", "image/jpeg", "image/png"]
    size_bytes: int
    checksum_sha256: str


class PieceUploadInitOut(BaseModel):
    upload_url: str
    s3_key: str
    method: str = "PUT"
    headers: dict[str, str]


class PieceUploadCompleteIn(BaseModel):
    type_piece: PieceType
    filename: str
    s3_key: str
    checksum_sha256: str


class DossierPieceChecklistItemOut(BaseModel):
    type_piece: PieceType
    uploaded: bool
    filename: str | None = None  # Nom du fichier uploadé, None si non déposé


class HistoriqueItemOut(BaseModel):
    """Entrée chronologique du journal de statuts d'un dossier."""

    ancien_status: str | None = None
    nouveau_status: str
    commentaire: str | None = None
    created_at: datetime


class PieceDownloadUrlOut(BaseModel):
    """URL pré-signée GET pour télécharger une pièce justificative."""

    download_url: str
    filename: str


class LldOptionRowOut(BaseModel):
    """Une option LLD affichée au client (US-07-01)."""

    code: str
    label: str
    description: str
    surcout_mensuel_ht: float
    selected: bool


class LldOptionsPricingOut(BaseModel):
    """Récapitulatif mensuel LLD : base véhicule + options cochées."""

    base_mensualite_ht: float | None = None
    options_supplement_ht: float
    total_mensualite_ht: float
    editable: bool
    edit_context: LldEditContext = "readonly"
    items: list[LldOptionRowOut]


class LldOptionsPatchIn(BaseModel):
    """Mise à jour partielle ou complète des cases à cocher LLD."""

    selections: dict[str, bool]


class DossierContratSummaryOut(BaseModel):
    """Résumé du contrat dans le détail dossier (US-06-07)."""

    reference: str
    signed_at: datetime | None = None
    can_sign: bool = False


class DossierContratContentOut(BaseModel):
    """Markdown du contrat : réservé au client propriétaire du dossier."""

    reference: str
    markdown: str
    signed_at: datetime | None = None


class DossierContratSignatureRequestIn(BaseModel):
    """Corps attendu après validation dans la modale « Signer le contrat »."""

    accepte: bool = True


class DossierDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    type: DossierTypeEnum
    status: str
    vehicle_id: int
    client_id: int
    created_at: datetime | None = None
    submitted_at: datetime | None = None
    motif_rejet: str | None = None
    checklist: list[DossierPieceChecklistItemOut]
    missing_pieces: list[PieceType]
    can_submit: bool
    vehicle: VehicleSummaryOut | None = None
    historique: list[HistoriqueItemOut] = []
    lld_pricing: LldOptionsPricingOut | None = None
    contrat: DossierContratSummaryOut | None = None


# ── US-06-01 : Tableau de bord gestionnaire ───────────────────────────────────

class ClientSummaryOut(BaseModel):
    """Résumé client pour la vue back-office d'un dossier."""

    id: int
    email: str
    first_name: str
    last_name: str


class DossierBoItemOut(BaseModel):
    """Dossier enrichi pour le tableau de bord gestionnaire (US-06-01)."""

    id: int
    reference: str
    type: DossierTypeEnum
    status: str
    submitted_at: datetime | None = None
    created_at: datetime | None = None
    vehicle: VehicleSummaryOut
    client: ClientSummaryOut
    pieces_count: int


class DossierBoListOut(BaseModel):
    """Réponse paginée du tableau de bord gestionnaire."""

    total: int
    page: int
    page_size: int
    items: list[DossierBoItemOut]


class DossierPrendreEnChargeOut(BaseModel):
    """Réponse après prise en charge d'un dossier (US-06-02)."""

    id: int
    reference: str
    status: str
    gestionnaire_id: int


class DossierValiderOut(BaseModel):
    """Réponse après validation d'un dossier par le gestionnaire (US-06-04)."""

    id: int
    reference: str
    status: str
    validated_at: datetime | None = None


class DossierRejeterIn(BaseModel):
    """Payload pour rejeter un dossier (US-06-05) — motif communiqué au client."""

    motif: str = Field(..., description="Motif obligatoire (min. 20 caractères utiles).")

    @field_validator("motif")
    @classmethod
    def motif_longueur(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 20:
            raise ValueError("Le motif doit contenir au moins 20 caractères.")
        if len(s) > 4000:
            raise ValueError("Le motif ne peut pas dépasser 4000 caractères.")
        return s


class DossierRejeterOut(BaseModel):
    """Réponse après rejet d'un dossier par le gestionnaire (US-06-05)."""

    id: int
    reference: str
    status: str
    motif_rejet: str
    rejected_at: datetime | None = None


# ── US-06-03 : Détail dossier gestionnaire ────────────────────────────────────

class PieceBoOut(BaseModel):
    """Pièce justificative vue du gestionnaire (uploaded ou manquante)."""

    type_piece: PieceType
    uploaded: bool
    filename: str | None = None
    uploaded_at: datetime | None = None


class DossierBoDetailOut(BaseModel):
    """Détail complet d'un dossier pour le gestionnaire (US-06-03)."""

    id: int
    reference: str
    type: DossierTypeEnum
    status: str
    validated_at: datetime | None = None
    submitted_at: datetime | None = None
    created_at: datetime | None = None
    rejected_at: datetime | None = None
    motif_rejet: str | None = None
    notes_internes: str | None = None
    vehicle: VehicleSummaryOut
    client: ClientSummaryOut
    pieces: list[PieceBoOut]
    historique: list[HistoriqueItemOut] = []


# ── US-04-04 : Contrats LLD ───────────────────────────────────────────────────

class ContratVehicleOut(BaseModel):
    """Informations véhicule incluses dans le résumé d'un contrat LLD."""

    make: str
    model: str
    year: int
    mensualite: float | None = None


class ContratListItemOut(BaseModel):
    """Contrat LLD validé visible dans l'espace client."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    vehicle_id: int
    vehicle: ContratVehicleOut
    duree_mois: int | None = None
    date_debut: date | None = None
    date_fin: date | None = None
    is_active: bool
