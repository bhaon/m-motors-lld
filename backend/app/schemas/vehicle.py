import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from app.models.vehicle import MoteurEnum

_IMG_EXT_RE = re.compile(r"\.(jpe?g|png)", re.IGNORECASE)


class VehicleOptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    surcharge: float

    # Alias pour compatibilité avec le front Next.js (n/p)
    @property
    def n(self) -> str:
        return self.name

    @property
    def p(self) -> str:
        return f"+{self.surcharge:.0f}€/mois"


class VehicleSpecsOut(BaseModel):
    carburant: str
    boite: str
    couleur: str
    places: int
    puissance: str


class VehicleOut(BaseModel):
    """Schéma de sortie compatible avec l'interface Vehicle du front Next.js"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    make: str
    model: str
    year: int
    km: int
    moteur: MoteurEnum
    prix: float
    lld: bool
    mensualite: Optional[float] = None
    img: str
    specs: VehicleSpecsOut
    options: List[VehicleOptionOut]

    @classmethod
    def from_orm_vehicle(cls, v) -> "VehicleOut":
        return cls(
            id=v.id,
            make=v.make,
            model=v.model,
            year=v.year,
            km=v.km,
            moteur=v.moteur,
            prix=float(v.prix),
            lld=v.lld,
            mensualite=float(v.mensualite) if v.mensualite else None,
            img=v.img,
            specs=VehicleSpecsOut(
                carburant=v.spec_carburant,
                boite=v.spec_boite,
                couleur=v.spec_couleur,
                places=v.spec_places,
                puissance=v.spec_puissance,
            ),
            options=[VehicleOptionOut.model_validate(o) for o in v.options],
        )


class VehicleListOut(BaseModel):
    total: int
    items: List[VehicleOut]


class VehicleBoOut(VehicleOut):
    """Schéma de sortie back-office : inclut visible_catalogue, archived, archived_at."""

    visible_catalogue: bool
    archived: bool = False
    archived_at: Optional[datetime] = None

    @classmethod
    def from_bo_vehicle(cls, v) -> "VehicleBoOut":
        return cls(
            id=v.id,
            make=v.make,
            model=v.model,
            year=v.year,
            km=v.km,
            moteur=v.moteur,
            prix=float(v.prix),
            lld=v.lld,
            mensualite=float(v.mensualite) if v.mensualite else None,
            img=v.img,
            specs=VehicleSpecsOut(
                carburant=v.spec_carburant,
                boite=v.spec_boite,
                couleur=v.spec_couleur,
                places=v.spec_places,
                puissance=v.spec_puissance,
            ),
            options=[VehicleOptionOut.model_validate(o) for o in v.options],
            visible_catalogue=v.visible_catalogue,
            archived=v.archived,
            archived_at=v.archived_at,
        )


class VehicleCreate(BaseModel):
    make: str
    model: str
    year: int
    km: int
    moteur: MoteurEnum
    prix: float
    lld: bool
    mensualite: Optional[float] = None
    img: str
    spec_carburant: str
    spec_boite: str
    spec_couleur: str
    spec_places: int = 5
    spec_puissance: str
    visible_catalogue: bool = True
    photos_urls: Optional[List[str]] = None

    @field_validator("img")
    @classmethod
    def img_non_vide(cls, v: str) -> str:
        """US-05-01 — au moins une photo principale est obligatoire."""
        if not v or not v.strip():
            raise ValueError("L'URL de la photo principale est obligatoire.")
        return v.strip()

    @model_validator(mode="after")
    def mensualite_si_lld(self) -> "VehicleCreate":
        """US-05-01 — une offre LLD impose une mensualité."""
        if self.lld and self.mensualite is None:
            raise ValueError("mensualite est requise lorsque lld est activé")
        return self


class VehicleCreateOut(BaseModel):
    """Confirmation de création d'un véhicule (endpoint formulaire gestionnaire)."""

    id: int
    reference: str
    message: str


class ToggleLldOut(BaseModel):
    """Réponse du toggle Achat ↔ LLD.

    - toggled=True  : la bascule a été effectuée.
    - toggled=False : des dossiers actifs existent, confirmation requise via ?confirm=true.
    """

    vehicle: VehicleOut
    toggled: bool
    warning: Optional[str] = None
    active_dossiers_count: int = 0


# ── Gestion des photos (US-05-05) ─────────────────────────────────────────────

class VehiclePhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    is_main: bool
    order: int


class VehiclePhotoAddIn(BaseModel):
    """Ajout de une ou plusieurs photos par URL (formats JPG/PNG) — API / tests."""

    urls: List[str]

    @field_validator("urls")
    @classmethod
    def validate_image_urls(cls, values: List[str]) -> List[str]:
        for url in values:
            if not url.strip():
                raise ValueError("L'URL ne peut pas être vide.")
            if not _IMG_EXT_RE.search(url):
                raise ValueError(
                    f"Format non supporté : '{url}'. Utilisez une URL pointant vers un fichier JPG ou PNG."
                )
        return values


class PhotoUploadInitIn(BaseModel):
    """Demande d'initialisation d'un upload photo vers MinIO."""

    filename: str
    content_type: str  # "image/jpeg" | "image/png"
    file_size: int  # octets

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: str) -> str:
        allowed = {"image/jpeg", "image/jpg", "image/png"}
        if v.lower() not in allowed:
            raise ValueError("Type de fichier non supporté. Utilisez JPG ou PNG.")
        return v.lower()

    @field_validator("file_size")
    @classmethod
    def validate_file_size(cls, v: int) -> int:
        if v <= 0 or v > 5 * 1024 * 1024:
            raise ValueError("Fichier trop volumineux (5 Mo max).")
        return v


class PhotoUploadInitOut(BaseModel):
    """URL pré-signée pour l'upload direct vers MinIO + clé objet."""

    upload_url: str
    object_key: str
    expires_in: int = 600


class PhotoUploadCompleteIn(BaseModel):
    """Confirmation d'upload : clé objet de la photo uploadée dans MinIO."""

    object_key: str


class PhotoLibraryItemOut(BaseModel):
    """Photo existante en bibliothèque (tous véhicules)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    vehicle_id: int
    vehicle_make: str
    vehicle_model: str


class PhotoFromLibraryIn(BaseModel):
    """Réutilisation d'une photo de la bibliothèque pour un véhicule."""

    source_photo_id: int


class PhotoOrderItem(BaseModel):
    id: int
    order: int


class VehiclePhotoReorderIn(BaseModel):
    """Réordonnancement des photos d'un véhicule."""

    photos: List[PhotoOrderItem]


class VehicleUpdate(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    km: Optional[int] = None
    moteur: Optional[MoteurEnum] = None
    prix: Optional[float] = None
    lld: Optional[bool] = None
    mensualite: Optional[float] = None
    img: Optional[str] = None
    visible_catalogue: Optional[bool] = None
    spec_carburant: Optional[str] = None
    spec_boite: Optional[str] = None
    spec_couleur: Optional[str] = None
    spec_places: Optional[int] = None
    spec_puissance: Optional[str] = None
