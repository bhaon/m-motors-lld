from pydantic import BaseModel, ConfigDict

from app.models.dossier import DossierTypeEnum


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
