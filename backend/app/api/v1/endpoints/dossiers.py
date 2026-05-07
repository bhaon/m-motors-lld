from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, HTTPException, status
from jose import JWTError

from app.core.deps import DbSession
from app.core.security import decode_token
from app.models.dossier import Dossier, PieceJustificative
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.dossier import (
    DossierCreateIn,
    DossierCreateOut,
    PieceUploadCompleteIn,
    PieceUploadInitIn,
    PieceUploadInitOut,
)
from app.services.object_storage import (
    build_piece_object_key,
    ensure_bucket_exists,
    ensure_bucket_cors,
    generate_upload_url,
    get_s3_client,
    verify_object_checksum,
)

router = APIRouter(prefix="/dossiers", tags=["Dossiers"])
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
REQUIRED_PIECE_TYPES = ("cni", "permis", "revenus", "domicile", "rib")


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


def _get_owned_dossier(db: DbSession, *, dossier_id: int, user_id: int) -> Dossier:
    """Retourne un dossier appartenant au client connecté ou lève 404."""
    dossier = (
        db.query(Dossier)
        .filter(
            Dossier.id == dossier_id,
            Dossier.client_id == user_id,
        )
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")
    return dossier


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


@router.post("/{dossier_id}/pieces/upload-init", response_model=PieceUploadInitOut)
def init_piece_upload(
    dossier_id: int,
    payload: PieceUploadInitIn,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> PieceUploadInitOut:
    """Prépare un upload MinIO pré-signé en validant type, taille et checksum demandé."""
    user = _resolve_user_from_cookie(access_token, db)
    _get_owned_dossier(db, dossier_id=dossier_id, user_id=user.id)
    if payload.type_piece not in REQUIRED_PIECE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de pièce non supporté")
    if payload.size_bytes <= 0 or payload.size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fichier trop volumineux (10 Mo max)")
    if not payload.checksum_sha256.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checksum SHA-256 invalide")

    s3_client = get_s3_client()
    ensure_bucket_exists(s3_client)
    ensure_bucket_cors(s3_client)
    object_key = build_piece_object_key(
        dossier_id=dossier_id,
        piece_type=payload.type_piece,
        filename=payload.filename,
    )
    upload_url = generate_upload_url(
        s3_client,
        object_key=object_key,
        content_type=payload.content_type,
        checksum_sha256=payload.checksum_sha256,
    )
    return PieceUploadInitOut(
        upload_url=upload_url,
        s3_key=object_key,
        headers={
            "Content-Type": payload.content_type,
            "x-amz-checksum-sha256": payload.checksum_sha256,
        },
    )


@router.post("/{dossier_id}/pieces/upload-complete", status_code=status.HTTP_201_CREATED)
def complete_piece_upload(
    dossier_id: int,
    payload: PieceUploadCompleteIn,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> dict[str, str]:
    """Valide le checksum côté backend puis enregistre la pièce dans le dossier."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = _get_owned_dossier(db, dossier_id=dossier_id, user_id=user.id)
    s3_client = get_s3_client()
    if not verify_object_checksum(
        s3_client,
        object_key=payload.s3_key,
        expected_checksum_hex=payload.checksum_sha256,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checksum SHA-256 non conforme")

    existing = (
        db.query(PieceJustificative)
        .filter(
            PieceJustificative.dossier_id == dossier.id,
            PieceJustificative.type_piece == payload.type_piece,
        )
        .first()
    )
    if existing:
        existing.filename = payload.filename
        existing.s3_key = payload.s3_key
        existing.checksum = payload.checksum_sha256.lower()
    else:
        db.add(
            PieceJustificative(
                dossier_id=dossier.id,
                type_piece=payload.type_piece,
                filename=payload.filename,
                s3_key=payload.s3_key,
                checksum=payload.checksum_sha256.lower(),
            )
        )
    db.commit()
    return {"message": "Pièce uploadée et validée"}
