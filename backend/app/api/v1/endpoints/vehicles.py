from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Query, status

from app.api.v1.openapi_responses import openapi_http_error
from app.core.deps import DbSession, GestionnaireUser
from app.models.vehicle import MoteurEnum, Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleListOut, VehicleOut, VehicleUpdate

router = APIRouter(prefix="/vehicules", tags=["Véhicules"])

# Corps JSON ``detail`` pour les 404 catalogue / back-office (aligné avec la doc OpenAPI).
VEHICULE_INTROUVABLE_DETAIL = "Véhicule introuvable"

_R403_BO = openapi_http_error(
    status.HTTP_403_FORBIDDEN,
    "Rôle gestionnaire, superviseur ou admin requis",
    "Rôle requis : ['gestionnaire', 'superviseur', 'admin']",
)

_R404_VEHICULE = openapi_http_error(
    status.HTTP_404_NOT_FOUND,
    "Véhicule inexistant ou archivé",
    VEHICULE_INTROUVABLE_DETAIL,
)


# ──────────────────────────────────────────────
# EP-01 — Public (US-01-01 à US-01-05)
# ──────────────────────────────────────────────


@router.get("", response_model=VehicleListOut, summary="US-01-01/03 — Catalogue public avec filtres")
def list_vehicles(
    db: DbSession,
    marque: Annotated[str | None, Query()] = None,
    modele: Annotated[str | None, Query()] = None,
    moteur: Annotated[MoteurEnum | None, Query()] = None,
    km_max: Annotated[int | None, Query(alias="kmMax")] = None,
    prix_max: Annotated[float | None, Query(alias="prixMax")] = None,
    type_contrat: Annotated[str | None, Query(alias="type")] = None,  # all | achat | lld
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    q = db.query(Vehicle).filter(
        Vehicle.archived == False,
        Vehicle.visible_catalogue == True,
    )
    if marque:
        q = q.filter(Vehicle.make.ilike(f"%{marque}%"))
    if modele:
        q = q.filter(Vehicle.model.ilike(f"%{modele}%"))
    if moteur:
        q = q.filter(Vehicle.moteur == moteur)
    if km_max is not None:
        q = q.filter(Vehicle.km <= km_max)
    if prix_max is not None:
        q = q.filter(Vehicle.prix <= prix_max)
    if type_contrat == "lld":
        q = q.filter(Vehicle.lld == True)
    elif type_contrat == "achat":
        q = q.filter(Vehicle.lld == False)

    total = q.count()
    vehicles = q.order_by(Vehicle.created_at.desc()).offset(skip).limit(limit).all()

    return VehicleListOut(
        total=total,
        items=[VehicleOut.from_orm_vehicle(v) for v in vehicles],
    )


@router.get("/marques", summary="US-01-03 — Liste des marques disponibles")
def list_marques(db: DbSession):
    rows = (
        db.query(Vehicle.make)
        .filter(Vehicle.archived == False, Vehicle.visible_catalogue == True)
        .distinct()
        .order_by(Vehicle.make)
        .all()
    )
    return [r.make for r in rows]


@router.get(
    "/{vehicle_id}",
    response_model=VehicleOut,
    summary="US-01-04 — Fiche détaillée",
    responses={**_R404_VEHICULE},
)
def get_vehicle(vehicle_id: int, db: DbSession):
    v = (
        db.query(Vehicle)
        .filter(
            Vehicle.id == vehicle_id,
            Vehicle.archived == False,
        )
        .first()
    )
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )
    return VehicleOut.from_orm_vehicle(v)


# ──────────────────────────────────────────────
# EP-05 — Back-office (gestionnaire+)
# ──────────────────────────────────────────────


@router.post(
    "",
    response_model=VehicleOut,
    status_code=201,
    summary="US-05-01 — Créer un véhicule",
    responses={**_R403_BO},
)
def create_vehicle(
    payload: Annotated[VehicleCreate, Body()],
    db: DbSession,
    _: GestionnaireUser,
):
    v = Vehicle(**payload.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return VehicleOut.from_orm_vehicle(v)


@router.patch(
    "/{vehicle_id}",
    response_model=VehicleOut,
    summary="US-05-02 — Modifier un véhicule",
    responses={
        **_R403_BO,
        **_R404_VEHICULE,
    },
)
def update_vehicle(
    vehicle_id: int,
    payload: Annotated[VehicleUpdate, Body()],
    db: DbSession,
    _: GestionnaireUser,
):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(v, field, value)
    db.commit()
    db.refresh(v)
    return VehicleOut.from_orm_vehicle(v)


@router.post(
    "/{vehicle_id}/toggle-lld",
    response_model=VehicleOut,
    summary="US-05-03 — Basculer Achat ↔ LLD",
    responses={
        **_R403_BO,
        **_R404_VEHICULE,
    },
)
def toggle_lld(
    vehicle_id: int,
    db: DbSession,
    _: GestionnaireUser,
):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )
    v.lld = not v.lld
    if not v.lld:
        v.mensualite = None
    db.commit()
    db.refresh(v)
    return VehicleOut.from_orm_vehicle(v)


@router.delete(
    "/{vehicle_id}",
    status_code=204,
    summary="US-05-04 — Archiver (soft delete)",
    responses={
        **_R403_BO,
        **_R404_VEHICULE,
    },
)
def archive_vehicle(
    vehicle_id: int,
    db: DbSession,
    _: GestionnaireUser,
):
    from datetime import datetime, timezone

    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )
    v.archived = True
    v.archived_at = datetime.now(timezone.utc)
    v.visible_catalogue = False
    db.commit()
