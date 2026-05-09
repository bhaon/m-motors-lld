from typing import Annotated

from fastapi import APIRouter, Body, Cookie, HTTPException, Query, Request, status

from app.api.v1.openapi_responses import openapi_http_error
from app.core.deps import DbSession, GestionnaireMultiAuth, GestionnaireUser, enforce_role, get_user_from_cookie
from app.models.user import RoleEnum
from app.models.vehicle import MoteurEnum, Vehicle, VehiclePhoto
from app.schemas.vehicle import (
    ToggleLldOut,
    VehicleBoOut,
    VehicleCreate,
    VehicleCreateOut,
    VehicleListOut,
    VehicleOut,
    VehiclePhotoAddIn,
    VehiclePhotoOut,
    VehiclePhotoReorderIn,
    VehicleUpdate,
)
from app.services import audit as audit_service

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
    "/backoffice",
    response_model=list[VehicleBoOut],
    summary="US-05-xx — Liste back-office (gestionnaire+, cookie)",
    responses={**_R403_BO},
)
def list_vehicles_backoffice(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=200),
    archived: bool = Query(default=False, description="true → véhicules archivés ; false (défaut) → actifs"),
) -> list[VehicleBoOut]:
    """Liste les véhicules back-office.

    Par défaut retourne les véhicules actifs (archived=false).
    Passez archived=true pour consulter les véhicules archivés.
    """
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)
    vehicles = (
        db.query(Vehicle)
        .filter(Vehicle.archived == archived)
        .order_by(Vehicle.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [VehicleBoOut.from_bo_vehicle(v) for v in vehicles]


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
    summary="US-05-01 — Créer un véhicule (Bearer)",
    responses={**_R403_BO},
)
def create_vehicle(
    payload: Annotated[VehicleCreate, Body()],
    db: DbSession,
    request: Request,
    current_user: GestionnaireUser,
):
    """Crée un véhicule via authentification Bearer (API / tests)."""
    v = Vehicle(**payload.model_dump(exclude={"photos_urls"}))
    db.add(v)
    db.flush()
    for url in (payload.photos_urls or []):
        db.add(VehiclePhoto(vehicle_id=v.id, url=url, is_main=False, order=1))
    audit_service.record(
        db,
        action=audit_service.VEHICLE_CREATED,
        entity_type="vehicle",
        entity_id=v.id,
        operator=current_user,
        ip_address=request.client.host if request.client else None,
        before_state=None,
        after_state={"id": v.id, "make": v.make, "model": v.model, "lld": v.lld, "prix": float(v.prix), "visible_catalogue": v.visible_catalogue},
    )
    db.commit()
    db.refresh(v)
    return VehicleOut.from_orm_vehicle(v)


@router.post(
    "/creer",
    response_model=VehicleCreateOut,
    status_code=201,
    summary="US-05-01 — Créer un véhicule (Cookie — formulaire gestionnaire)",
    responses={**_R403_BO},
)
def create_vehicle_form(
    payload: Annotated[VehicleCreate, Body()],
    db: DbSession,
    request: Request,
    access_token: str | None = Cookie(default=None),
):
    """Crée un véhicule via authentification cookie (formulaire front gestionnaire)."""
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    v = Vehicle(**payload.model_dump(exclude={"photos_urls"}))
    db.add(v)
    db.flush()
    for url in (payload.photos_urls or []):
        db.add(VehiclePhoto(vehicle_id=v.id, url=url, is_main=False, order=1))
    audit_service.record(
        db,
        action=audit_service.VEHICLE_CREATED,
        entity_type="vehicle",
        entity_id=v.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state=None,
        after_state={"id": v.id, "make": v.make, "model": v.model, "lld": v.lld, "prix": float(v.prix), "visible_catalogue": v.visible_catalogue},
    )
    db.commit()
    db.refresh(v)
    return VehicleCreateOut(
        id=v.id,
        reference=f"VEH-{v.id:05d}",
        message="Véhicule ajouté au catalogue avec succès.",
    )


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
    request: Request,
    current_user: GestionnaireMultiAuth,
):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )
    changed_fields = payload.model_dump(exclude_unset=True)
    before_state = {field: getattr(v, field) for field in changed_fields}
    for field, value in changed_fields.items():
        setattr(v, field, value)
    audit_service.record(
        db,
        action=audit_service.VEHICLE_UPDATED,
        entity_type="vehicle",
        entity_id=v.id,
        operator=current_user,
        ip_address=request.client.host if request.client else None,
        before_state=before_state,
        after_state=changed_fields,
    )
    db.commit()
    db.refresh(v)
    return VehicleOut.from_orm_vehicle(v)


@router.post(
    "/{vehicle_id}/toggle-lld",
    response_model=ToggleLldOut,
    summary="US-05-03 — Basculer Achat ↔ LLD",
    responses={
        **_R403_BO,
        **_R404_VEHICULE,
    },
)
def toggle_lld(
    vehicle_id: int,
    db: DbSession,
    request: Request,
    current_user: GestionnaireMultiAuth,
    confirm: bool = Query(default=False, description="Forcer la bascule même si des dossiers actifs existent."),
) -> ToggleLldOut:
    """Bascule le mode Achat ↔ LLD.

    Si le véhicule a des dossiers en cours (déposé/en instruction) et que
    `confirm=false`, retourne un avertissement sans effectuer la bascule.
    Passez `?confirm=true` pour forcer.
    """
    from app.models.dossier import Dossier, DossierStatusEnum

    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )

    active_statuses = [DossierStatusEnum.depose, DossierStatusEnum.en_instruction]
    active_count: int = (
        db.query(Dossier)
        .filter(Dossier.vehicle_id == vehicle_id, Dossier.status.in_(active_statuses))
        .count()
    )

    if active_count > 0 and not confirm:
        noun = "dossier actif" if active_count == 1 else "dossiers actifs"
        return ToggleLldOut(
            vehicle=VehicleOut.from_orm_vehicle(v),
            toggled=False,
            warning=(
                f"Ce véhicule a {active_count} {noun} (déposé/en instruction). "
                "Ajoutez ?confirm=true pour forcer la bascule."
            ),
            active_dossiers_count=active_count,
        )

    old_lld = v.lld
    v.lld = not v.lld
    if not v.lld:
        v.mensualite = None

    audit_service.record(
        db,
        action=audit_service.VEHICLE_LLD_TOGGLED,
        entity_type="vehicle",
        entity_id=v.id,
        operator=current_user,
        ip_address=request.client.host if request.client else None,
        before_state={"lld": old_lld, "mensualite": v.mensualite if v.mensualite is None else float(v.mensualite)},
        after_state={"lld": v.lld, "mensualite": None if not v.lld else (float(v.mensualite) if v.mensualite else None)},
    )
    db.commit()
    db.refresh(v)
    return ToggleLldOut(
        vehicle=VehicleOut.from_orm_vehicle(v),
        toggled=True,
        active_dossiers_count=active_count,
    )


@router.post(
    "/{vehicle_id}/restaurer",
    response_model=VehicleBoOut,
    summary="US-05-04 — Restaurer un véhicule archivé",
    responses={**_R403_BO, **_R404_VEHICULE},
)
def restore_vehicle(
    vehicle_id: int,
    db: DbSession,
    request: Request,
    current_user: GestionnaireMultiAuth,
) -> VehicleBoOut:
    """Restaure un véhicule archivé (annule le soft-delete) et le remet visible au catalogue."""
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == True).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Véhicule archivé introuvable.",
        )

    before_state = {
        "id": v.id, "make": v.make, "model": v.model,
        "archived": True,
        "archived_at": v.archived_at.isoformat() if v.archived_at else None,
    }
    v.archived = False
    v.archived_at = None
    v.visible_catalogue = True

    audit_service.record(
        db,
        action=audit_service.VEHICLE_RESTORED,
        entity_type="vehicle",
        entity_id=v.id,
        operator=current_user,
        ip_address=request.client.host if request.client else None,
        before_state=before_state,
        after_state={"archived": False, "visible_catalogue": True},
    )
    db.commit()
    db.refresh(v)
    return VehicleBoOut.from_bo_vehicle(v)


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
    request: Request,
    current_user: GestionnaireMultiAuth,
):
    from datetime import datetime, timezone

    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=VEHICULE_INTROUVABLE_DETAIL,
        )
    before_state = {"id": v.id, "make": v.make, "model": v.model, "archived": False, "visible_catalogue": v.visible_catalogue}
    v.archived = True
    v.archived_at = datetime.now(timezone.utc)
    v.visible_catalogue = False
    audit_service.record(
        db,
        action=audit_service.VEHICLE_ARCHIVED,
        entity_type="vehicle",
        entity_id=v.id,
        operator=current_user,
        ip_address=request.client.host if request.client else None,
        before_state=before_state,
        after_state={"archived": True, "archived_at": v.archived_at.isoformat(), "visible_catalogue": False},
    )
    db.commit()


# ── US-05-05 — Gestion des photos ─────────────────────────────────────────────


@router.get(
    "/{vehicle_id}/photos",
    response_model=list[VehiclePhotoOut],
    summary="US-05-05 — Lister les photos d'un véhicule",
    responses={**_R403_BO, **_R404_VEHICULE},
)
def list_photos(
    vehicle_id: int,
    db: DbSession,
    current_user: GestionnaireMultiAuth,
) -> list[VehiclePhotoOut]:
    """Retourne les photos du véhicule triées par ordre croissant."""
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICULE_INTROUVABLE_DETAIL)
    return v.photos


@router.post(
    "/{vehicle_id}/photos",
    response_model=list[VehiclePhotoOut],
    status_code=status.HTTP_201_CREATED,
    summary="US-05-05 — Ajouter des photos (JPG/PNG par URL)",
    responses={**_R403_BO, **_R404_VEHICULE},
)
def add_photos(
    vehicle_id: int,
    payload: VehiclePhotoAddIn,
    db: DbSession,
    current_user: GestionnaireMultiAuth,
) -> list[VehiclePhotoOut]:
    """Ajoute une ou plusieurs photos par URL (formats JPG/PNG uniquement)."""
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICULE_INTROUVABLE_DETAIL)
    max_order = max((p.order for p in v.photos), default=0)
    for i, url in enumerate(payload.urls):
        db.add(VehiclePhoto(vehicle_id=vehicle_id, url=url.strip(), is_main=False, order=max_order + i + 1))
    db.commit()
    db.refresh(v)
    return v.photos


@router.post(
    "/{vehicle_id}/photos/reordonner",
    response_model=list[VehiclePhotoOut],
    summary="US-05-05 — Réordonner les photos",
    responses={**_R403_BO, **_R404_VEHICULE},
)
def reorder_photos(
    vehicle_id: int,
    payload: VehiclePhotoReorderIn,
    db: DbSession,
    current_user: GestionnaireMultiAuth,
) -> list[VehiclePhotoOut]:
    """Applique de nouveaux numéros d'ordre aux photos du véhicule."""
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICULE_INTROUVABLE_DETAIL)
    photo_map = {p.id: p for p in v.photos}
    for item in payload.photos:
        if item.id in photo_map:
            photo_map[item.id].order = item.order
    db.commit()
    db.refresh(v)
    return sorted(v.photos, key=lambda p: p.order)


@router.patch(
    "/{vehicle_id}/photos/{photo_id}/principal",
    response_model=list[VehiclePhotoOut],
    summary="US-05-05 — Désigner la photo principale",
    responses={**_R403_BO, **_R404_VEHICULE},
)
def set_main_photo(
    vehicle_id: int,
    photo_id: int,
    db: DbSession,
    current_user: GestionnaireMultiAuth,
) -> list[VehiclePhotoOut]:
    """Définit une photo comme principale (met à jour vehicle.img et is_main)."""
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICULE_INTROUVABLE_DETAIL)
    target = db.query(VehiclePhoto).filter(
        VehiclePhoto.id == photo_id, VehiclePhoto.vehicle_id == vehicle_id
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo introuvable.")
    for p in v.photos:
        p.is_main = p.id == target.id
    v.img = target.url
    db.commit()
    db.refresh(v)
    return v.photos


@router.delete(
    "/{vehicle_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="US-05-05 — Supprimer une photo",
    responses={**_R403_BO, **_R404_VEHICULE},
)
def delete_photo(
    vehicle_id: int,
    photo_id: int,
    db: DbSession,
    current_user: GestionnaireMultiAuth,
) -> None:
    """Supprime une photo de la galerie.

    Si c'est la photo principale et qu'il en reste d'autres, la suivante devient principale.
    Impossible de supprimer la dernière photo de la galerie si elle est principale.
    """
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.archived == False).first()
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICULE_INTROUVABLE_DETAIL)
    target = db.query(VehiclePhoto).filter(
        VehiclePhoto.id == photo_id, VehiclePhoto.vehicle_id == vehicle_id
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo introuvable.")
    if target.is_main and len(v.photos) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de supprimer la seule photo principale. Ajoutez une autre photo d'abord.",
        )
    if target.is_main:
        for p in v.photos:
            if p.id != target.id:
                p.is_main = True
                v.img = p.url
                break
    db.delete(target)
    db.commit()
