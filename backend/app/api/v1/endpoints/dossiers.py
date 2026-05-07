from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, HTTPException, status
from jose import JWTError

from app.core.deps import DbSession
from app.core.security import decode_token
from app.models.dossier import Dossier
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.dossier import DossierCreateIn, DossierCreateOut

router = APIRouter(prefix="/dossiers", tags=["Dossiers"])


def _resolve_user_from_cookie(access_token: str | None, db: DbSession) -> User:
    """Résout l'utilisateur client à partir du cookie d'authentification."""
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise.")
    try:
        payload = decode_token(access_token)
        user_id = int(str(payload.get("sub")))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide.")

    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise.")
    return user


def _build_dossier_reference(db: DbSession, *, now: datetime) -> str:
    """Génère une référence lisible unique au format DOS-YYYY-00001."""
    year = now.year
    year_prefix = f"DOS-{year}-"
    sequence = db.query(Dossier).filter(Dossier.reference.like(f"{year_prefix}%")).count() + 1
    while True:
        reference = f"{year_prefix}{sequence:05d}"
        exists = db.query(Dossier.id).filter(Dossier.reference == reference).first()
        if not exists:
            return reference
        sequence += 1


@router.post("", response_model=DossierCreateOut, status_code=status.HTTP_201_CREATED)
def create_dossier(
    payload: DossierCreateIn,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> DossierCreateOut:
    """Crée un dossier client depuis une fiche véhicule puis retourne sa référence."""
    user = _resolve_user_from_cookie(access_token, db)
    vehicle = (
        db.query(Vehicle)
        .filter(
            Vehicle.id == payload.vehicle_id,
            Vehicle.archived == False,
            Vehicle.visible_catalogue == True,
        )
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Véhicule introuvable")
    if payload.type.value == "lld" and not vehicle.lld:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ce véhicule n'accepte pas la LLD")

    dossier = Dossier(
        reference=_build_dossier_reference(db, now=datetime.now(timezone.utc)),
        type=payload.type,
        client_id=user.id,
        vehicle_id=vehicle.id,
    )
    db.add(dossier)
    db.commit()
    db.refresh(dossier)
    return DossierCreateOut(
        id=dossier.id,
        reference=dossier.reference,
        type=dossier.type,
        status=dossier.status.value,
        vehicle_id=dossier.vehicle_id,
        client_id=dossier.client_id,
    )
