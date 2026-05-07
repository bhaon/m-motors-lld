from pydantic import BaseModel, ConfigDict
from typing import Literal

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
