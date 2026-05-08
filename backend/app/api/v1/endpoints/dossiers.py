from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timezone
import logging
from typing import cast

from fastapi import APIRouter, Cookie, HTTPException, status

from app.core.deps import DbSession, enforce_role, get_user_from_cookie
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum, PieceJustificative
from app.models.user import RoleEnum, User
from app.models.vehicle import Vehicle
from sqlalchemy.orm import joinedload

from app.schemas.dossier import (
    ContratListItemOut,
    ContratVehicleOut,
    DossierCreateIn,
    DossierCreateOut,
    DossierDetailOut,
    DossierListItemOut,
    DossierPieceChecklistItemOut,
    HistoriqueItemOut,
    PieceDownloadUrlOut,
    PieceType,
    PieceUploadCompleteIn,
    PieceUploadInitIn,
    PieceUploadInitOut,
    VehicleSummaryOut,
)
from app.services.object_storage import (
    build_piece_object_key,
    ensure_bucket_exists,
    ensure_bucket_cors,
    generate_download_url,
    generate_upload_url,
    get_s3_client,
    verify_object_checksum,
)
from app.core.config import settings
from app.services.emailing import send_status_change_email

router = APIRouter(prefix="/dossiers", tags=["Dossiers"])
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
REQUIRED_PIECE_TYPES: tuple[PieceType, ...] = ("cni", "permis", "revenus", "domicile", "rib")
logger = logging.getLogger(__name__)


def _resolve_user_from_cookie(access_token: str | None, db: DbSession) -> User:
    """Résout l'utilisateur depuis le cookie JWT (délègue à get_user_from_cookie).

    Inclut la vérification du claim rôle JWT contre le rôle en base (US-11-03).
    """
    return get_user_from_cookie(access_token, db)


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


def _build_piece_checklist(
    db: DbSession, *, dossier_id: int
) -> tuple[list[DossierPieceChecklistItemOut], list[PieceType], bool]:
    """Construit la checklist des pièces, la liste des manquantes et le booléen de soumission."""
    pieces = (
        db.query(PieceJustificative.type_piece, PieceJustificative.filename)
        .filter(PieceJustificative.dossier_id == dossier_id)
        .all()
    )
    filename_map: dict[str, str] = {}
    uploaded_types: set[PieceType] = set()
    for p in pieces:
        if p.type_piece in REQUIRED_PIECE_TYPES:
            uploaded_types.add(cast(PieceType, p.type_piece))
            filename_map[p.type_piece] = p.filename
    checklist = [
        DossierPieceChecklistItemOut(
            type_piece=piece_type,
            uploaded=piece_type in uploaded_types,
            filename=filename_map.get(piece_type),
        )
        for piece_type in REQUIRED_PIECE_TYPES
    ]
    missing_pieces = [piece_type for piece_type in REQUIRED_PIECE_TYPES if piece_type not in uploaded_types]
    return checklist, missing_pieces, len(missing_pieces) == 0


def _format_utc_timestamp(timestamp: datetime) -> str:
    """Retourne une date ISO 8601 normalisée en UTC (suffixe Z)."""
    return timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _add_months(d: date, months: int) -> date:
    """Ajoute un nombre entier de mois à une date en respectant les fins de mois."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


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
        created_at=dossier.created_at,
    )


@router.get("/me", response_model=list[DossierListItemOut])
def list_my_dossiers(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> list[DossierListItemOut]:
    """Retourne les dossiers du client connecté avec info véhicule, du plus récent au plus ancien."""
    user = _resolve_user_from_cookie(access_token, db)
    dossiers = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle))
        .filter(Dossier.client_id == user.id)
        .order_by(Dossier.created_at.desc(), Dossier.id.desc())
        .all()
    )
    return [
        DossierListItemOut(
            id=d.id,
            reference=d.reference,
            type=d.type,
            status=d.status.value,
            vehicle_id=d.vehicle_id,
            client_id=d.client_id,
            created_at=d.created_at,
            vehicle=VehicleSummaryOut(
                make=d.vehicle.make if d.vehicle else "—",
                model=d.vehicle.model if d.vehicle else "",
                year=d.vehicle.year if d.vehicle else 0,
            ),
        )
        for d in dossiers
    ]


@router.get("/backoffice", response_model=list[DossierListItemOut])
def list_all_dossiers_backoffice(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> list[DossierListItemOut]:
    """Liste tous les dossiers (tous clients) — réservé gestionnaire, superviseur, admin."""
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)
    dossiers = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle))
        .order_by(Dossier.created_at.desc(), Dossier.id.desc())
        .all()
    )
    return [
        DossierListItemOut(
            id=d.id,
            reference=d.reference,
            type=d.type,
            status=d.status.value,
            vehicle_id=d.vehicle_id,
            client_id=d.client_id,
            created_at=d.created_at,
            vehicle=VehicleSummaryOut(
                make=d.vehicle.make if d.vehicle else "—",
                model=d.vehicle.model if d.vehicle else "",
                year=d.vehicle.year if d.vehicle else 0,
            ),
        )
        for d in dossiers
    ]


@router.get("/contrats", response_model=list[ContratListItemOut])
def list_my_contrats(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> list[ContratListItemOut]:
    """Retourne les contrats LLD validés du client connecté, actifs et terminés."""
    user = _resolve_user_from_cookie(access_token, db)
    dossiers = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle))
        .filter(
            Dossier.client_id == user.id,
            Dossier.type == DossierTypeEnum.lld,
            Dossier.status == DossierStatusEnum.valide,
        )
        .order_by(Dossier.created_at.desc())
        .all()
    )
    today = date.today()
    result: list[ContratListItemOut] = []
    for d in dossiers:
        date_fin: date | None = None
        if d.date_debut_contrat and d.duree_mois:
            date_fin = _add_months(d.date_debut_contrat, d.duree_mois)
        is_active = date_fin is None or date_fin >= today
        result.append(
            ContratListItemOut(
                id=d.id,
                reference=d.reference,
                vehicle_id=d.vehicle_id,
                vehicle=ContratVehicleOut(
                    make=d.vehicle.make if d.vehicle else "—",
                    model=d.vehicle.model if d.vehicle else "",
                    year=d.vehicle.year if d.vehicle else 0,
                    mensualite=float(d.vehicle.mensualite) if d.vehicle and d.vehicle.mensualite else None,
                ),
                duree_mois=d.duree_mois,
                date_debut=d.date_debut_contrat,
                date_fin=date_fin,
                is_active=is_active,
            )
        )
    result.sort(key=lambda c: (not c.is_active, -(c.date_debut.toordinal() if c.date_debut else 0)))
    return result


@router.get("/{dossier_id}", response_model=DossierDetailOut)
def get_dossier_detail(
    dossier_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> DossierDetailOut:
    """Retourne le détail complet d'un dossier : infos véhicule, checklist, historique et motif de rejet."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle), joinedload(Dossier.historique))
        .filter(Dossier.id == dossier_id, Dossier.client_id == user.id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")
    checklist, missing_pieces, can_submit = _build_piece_checklist(db, dossier_id=dossier.id)
    vehicle_out = (
        VehicleSummaryOut(
            make=dossier.vehicle.make,
            model=dossier.vehicle.model,
            year=dossier.vehicle.year,
        )
        if dossier.vehicle
        else None
    )
    historique_out = [
        HistoriqueItemOut(
            ancien_status=h.ancien_status,
            nouveau_status=h.nouveau_status,
            commentaire=h.commentaire,
            created_at=h.created_at,
        )
        for h in dossier.historique
    ]
    return DossierDetailOut(
        id=dossier.id,
        reference=dossier.reference,
        type=dossier.type,
        status=dossier.status.value,
        vehicle_id=dossier.vehicle_id,
        client_id=dossier.client_id,
        created_at=dossier.created_at,
        submitted_at=dossier.submitted_at,
        motif_rejet=dossier.motif_rejet,
        checklist=checklist,
        missing_pieces=missing_pieces,
        can_submit=can_submit,
        vehicle=vehicle_out,
        historique=historique_out,
    )


@router.get("/{dossier_id}/pieces/{type_piece}/download-url", response_model=PieceDownloadUrlOut)
def get_piece_download_url(
    dossier_id: int,
    type_piece: PieceType,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> PieceDownloadUrlOut:
    """Génère une URL pré-signée GET (10 min) pour télécharger une pièce justificative."""
    user = _resolve_user_from_cookie(access_token, db)
    _get_owned_dossier(db, dossier_id=dossier_id, user_id=user.id)
    piece = (
        db.query(PieceJustificative)
        .filter(
            PieceJustificative.dossier_id == dossier_id,
            PieceJustificative.type_piece == type_piece,
        )
        .first()
    )
    if not piece:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document non trouvé.")
    s3_client = get_s3_client()
    download_url = generate_download_url(s3_client, object_key=piece.s3_key, filename=piece.filename)
    return PieceDownloadUrlOut(download_url=download_url, filename=piece.filename)


@router.delete("/{dossier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dossier(
    dossier_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> None:
    """Supprime un dossier client uniquement lorsqu'il est encore en brouillon."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = _get_owned_dossier(db, dossier_id=dossier_id, user_id=user.id)
    if dossier.status != DossierStatusEnum.brouillon:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les dossiers en brouillon peuvent être supprimés.",
        )
    db.delete(dossier)
    db.commit()


@router.post("/{dossier_id}/submit", response_model=DossierDetailOut)
def submit_dossier(
    dossier_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> DossierDetailOut:
    """Soumet un dossier uniquement si toutes les pièces obligatoires sont présentes."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = _get_owned_dossier(db, dossier_id=dossier_id, user_id=user.id)
    checklist, missing_pieces, can_submit = _build_piece_checklist(db, dossier_id=dossier.id)
    if not can_submit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Pièces manquantes: {', '.join(missing_pieces)}",
        )
    dossier.status = DossierStatusEnum.depose
    dossier.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(dossier)
    try:
        send_status_change_email(
            to_email=user.email,
            dossier_reference=dossier.reference,
            nouveau_status=dossier.status.value,
            dossier_url=f"{settings.FRONTEND_BASE_URL}/mes-dossiers/{dossier.id}",
        )
    except Exception:
        # L'échec email ne doit pas annuler une soumission validée en base.
        logger.exception("Echec envoi notification statut pour le dossier %s", dossier.reference)
    checklist, missing_pieces, can_submit = _build_piece_checklist(db, dossier_id=dossier.id)
    return DossierDetailOut(
        id=dossier.id,
        reference=dossier.reference,
        type=dossier.type,
        status=dossier.status.value,
        vehicle_id=dossier.vehicle_id,
        client_id=dossier.client_id,
        created_at=dossier.created_at,
        submitted_at=dossier.submitted_at,
        checklist=checklist,
        missing_pieces=missing_pieces,
        can_submit=can_submit,
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
