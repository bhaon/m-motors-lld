from pydantic import BaseModel, ConfigDict
from typing import Literal
from datetime import datetime

from app.models.dossier import DossierTypeEnum

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
    checklist: list[DossierPieceChecklistItemOut]
    missing_pieces: list[PieceType]
    can_submit: bool
