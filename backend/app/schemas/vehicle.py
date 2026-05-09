from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from app.models.vehicle import MoteurEnum


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
