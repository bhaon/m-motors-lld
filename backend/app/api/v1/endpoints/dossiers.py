from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
import logging
from typing import cast
from zoneinfo import ZoneInfo

from typing import Annotated
from fastapi import APIRouter, Cookie, HTTPException, Query, Request, status

from app.core.deps import DbSession, enforce_role, get_user_from_cookie
from app.api.v1.endpoints.auth import (
    _generate_email_verification_token,
    _hash_email_verification_token,
)
from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum, PieceJustificative
from app.models.dossier_contract import DossierContrat
from app.models.option_lld import OptionLld
from app.models.user import RoleEnum, User
from app.models.vehicle import Vehicle
from sqlalchemy.orm import joinedload

from app.schemas.dossier import (
    ClientSummaryOut,
    ContratListItemOut,
    ContratVehicleOut,
    DossierBoDetailOut,
    DossierBoItemOut,
    DossierBoListOut,
    DossierCreateIn,
    DossierContratContentOut,
    DossierContratSignatureRequestIn,
    DossierContratSummaryOut,
    DossierCreateOut,
    DossierDetailOut,
    LldOptionRowOut,
    LldOptionsPatchIn,
    LldOptionsPricingOut,
    DossierPlanifierLivraisonIn,
    DossierPlanifierLivraisonOut,
    DossierEffectuerLivraisonOut,
    DossierListItemOut,
    LivraisonInfoOut,
    DossierRejeterIn,
    DossierRejeterOut,
    DossierValiderOut,
    DossierPieceChecklistItemOut,
    DossierPrendreEnChargeOut,
    HistoriqueItemOut,
    PieceBoOut,
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
from app.services.contract_fill import build_contract_reference, render_contract_markdown
from app.services.emailing import (
    send_contract_ready_email,
    send_contract_signature_link_email,
    send_livraison_planifiee_email,
    send_status_change_email,
)
from app.services import audit as audit_service
from app.services.lld_catalog_data import is_lld_option_enabled
from app.services.lld_avenant_flow import (
    create_pending_avenant,
    expire_stale_lld_avenant_if_needed,
    record_avenant_demande_audit,
    send_avenant_signature_email,
)
from app.services.lld_dossier_lifecycle import close_expired_lld_contract_dossiers
from app.services.lld_options_catalog import (
    LldOptionsState,
    build_lld_options_state,
    contrat_lld_est_actif,
    dossier_allows_lld_option_edit,
    ensure_option_rows_for_lld_dossier,
    merge_lld_selections_from_payload,
    pending_unsigned_lld_avenant,
    selections_differ_from_rows,
    validate_selection_keys,
)

router = APIRouter(prefix="/dossiers", tags=["Dossiers"])
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
REQUIRED_PIECE_TYPES: tuple[PieceType, ...] = ("cni", "permis", "revenus", "domicile", "rib")
logger = logging.getLogger(__name__)

# US-06-10 — lieu de remise véhicule (fixe produit).
LIEU_LIVRAISON_DEFAUT = "Garage Gaudin"

# US-06-09 — durée contractuelle LLD après livraison effective (3 ans).
LLD_DUREE_MOIS_APRES_LIVRAISON = 36


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


def _utc_safe(dt: datetime | None) -> datetime | None:
    """Normalise les datetimes SQLAlchemy/SQLite parfois naïfs en UTC pour la sérialisation JSON."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _date_livraison_calendar_fr(dt: datetime) -> date:
    """Jour calendaire en Europe/Paris pour ancrer le début de contrat LLD à la date de livraison."""
    aware = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return aware.astimezone(ZoneInfo("Europe/Paris")).date()


def _livraison_info_out(dossier: Dossier) -> LivraisonInfoOut | None:
    """Expose créneau + lieu lorsqu'une livraison a été planifiée."""
    if dossier.livraison_prevue_at is None:
        return None
    at = _utc_safe(dossier.livraison_prevue_at)
    if at is None:
        return None
    return LivraisonInfoOut(prevue_at=at, lieu=LIEU_LIVRAISON_DEFAUT)


def _contrat_summary_for_detail(dossier: Dossier) -> DossierContratSummaryOut | None:
    """Expose la présence du contrat et si le client peut encore initier / finaliser la signature."""
    if not dossier.contrat:
        return None
    c = dossier.contrat
    can_sign = dossier.status == DossierStatusEnum.en_signature and c.signed_at is None
    return DossierContratSummaryOut(
        reference=c.reference,
        signed_at=_utc_safe(c.signed_at),
        can_sign=can_sign,
    )


def _lld_options_pricing_out(state: LldOptionsState) -> LldOptionsPricingOut:
    """Projette l'état options LLD (dont avenant non signé, US-06-08) vers le schéma API."""
    return LldOptionsPricingOut(
        base_mensualite_ht=state.base_mensualite_ht,
        options_supplement_ht=state.options_supplement_ht,
        total_mensualite_ht=state.total_mensualite_ht,
        editable=state.editable,
        edit_context=state.edit_context,
        pending_avenant_signature=state.pending_avenant_signature,
        proposed_total_mensualite_ht=state.proposed_total_mensualite_ht,
        avenant_reference=state.avenant_reference,
        items=[
            LldOptionRowOut(
                code=str(i["code"]),
                label=str(i["label"]),
                description=str(i["description"]),
                surcout_mensuel_ht=float(cast(float | int | str, i["surcout_mensuel_ht"])),
                selected=bool(i["selected"]),
            )
            for i in state.items
        ],
    )


def _client_dossier_detail_out(db: DbSession, dossier: Dossier) -> DossierDetailOut:
    """Construit la réponse détail dossier côté client (dont bloc LLD si applicable)."""
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
            created_at=_utc_safe(h.created_at) or h.created_at,
        )
        for h in dossier.historique
    ]
    lld_pricing: LldOptionsPricingOut | None = None
    state = build_lld_options_state(db, dossier)
    if state:
        lld_pricing = _lld_options_pricing_out(state)
    return DossierDetailOut(
        id=dossier.id,
        reference=dossier.reference,
        type=dossier.type,
        status=dossier.status.value,
        vehicle_id=dossier.vehicle_id,
        client_id=dossier.client_id,
        created_at=_utc_safe(dossier.created_at),
        submitted_at=_utc_safe(dossier.submitted_at),
        motif_rejet=dossier.motif_rejet,
        checklist=checklist,
        missing_pieces=missing_pieces,
        can_submit=can_submit,
        vehicle=vehicle_out,
        historique=historique_out,
        lld_pricing=lld_pricing,
        contrat=_contrat_summary_for_detail(dossier),
        livraison=_livraison_info_out(dossier),
    )


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


def _notify_status_change(
    dossier: Dossier,
    client_email: str,
    *,
    motif_rejet: str | None = None,
) -> None:
    """Envoie la notification de changement de statut au client. Non-bloquant."""
    try:
        send_status_change_email(
            to_email=client_email,
            dossier_reference=dossier.reference,
            nouveau_status=dossier.status.value,
            dossier_url=f"{settings.FRONTEND_BASE_URL}/mes-dossiers/{dossier.id}",
            motif_rejet=motif_rejet,
        )
    except Exception:
        logger.exception(
            "Echec notification statut '%s' pour dossier %s",
            dossier.status.value,
            dossier.reference,
        )


def _existing_active_dossier_same_client_vehicle_type(
    db: DbSession,
    *,
    client_id: int,
    vehicle_id: int,
    dossier_type: DossierTypeEnum,
) -> Dossier | None:
    """Retourne un dossier encore actif (hors rejet / annulation) pour le même client, véhicule et type."""
    terminaux = (DossierStatusEnum.rejete, DossierStatusEnum.annule)
    return (
        db.query(Dossier)
        .filter(
            Dossier.client_id == client_id,
            Dossier.vehicle_id == vehicle_id,
            Dossier.type == dossier_type,
            Dossier.status.not_in(terminaux),
        )
        .first()
    )


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

    doublon = _existing_active_dossier_same_client_vehicle_type(
        db, client_id=user.id, vehicle_id=vehicle.id, dossier_type=payload.type
    )
    if doublon is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Vous avez déjà un dossier {payload.type.value.upper()} en cours pour ce véhicule "
                f"({doublon.reference}). Ouvrez-le depuis « Mes dossiers » pour poursuivre la démarche."
            ),
        )

    dossier = Dossier(
        reference=_build_dossier_reference(db, now=datetime.now(timezone.utc)),
        type=payload.type,
        client_id=user.id,
        vehicle_id=vehicle.id,
    )
    db.add(dossier)
    db.commit()
    db.refresh(dossier)
    if dossier.type == DossierTypeEnum.lld:
        ensure_option_rows_for_lld_dossier(db, dossier)
        db.commit()
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
    close_expired_lld_contract_dossiers(db)
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


@router.get("/backoffice", response_model=DossierBoListOut, summary="US-06-01 — Tableau de bord gestionnaire")
def list_all_dossiers_backoffice(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
    # Filtres — Query() obligatoire pour list[str], sinon FastAPI lit le corps JSON
    statuts: Annotated[list[str] | None, Query()] = None,
    type_contrat: Annotated[str | None, Query()] = None,
    date_from: Annotated[datetime | None, Query()] = None,
    date_to: Annotated[datetime | None, Query()] = None,
    # Tri
    sort: Annotated[str, Query()] = "submitted_asc",
    # Pagination
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> DossierBoListOut:
    """Liste paginée et filtrée des dossiers pour le tableau de bord gestionnaire.

    Filtres disponibles :
    - ``statuts`` (répétable) : ex. depose, contrat_en_cours, … Défaut = depose + en_instruction + attente_livraison + livraison_planifiee + contrat_en_cours.
    - ``type_contrat`` : achat | lld.
    - ``date_from`` / ``date_to`` : plage sur submitted_at.

    Tri : submitted_asc (défaut, plus anciens en premier), submitted_desc, created_desc.
    Pagination : page (≥ 1) + page_size (1–100, défaut 20).
    """
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    close_expired_lld_contract_dossiers(db)

    # Valeurs par défaut des statuts (flux actif + livraisons + contrats en cours)
    active_statuts = (
        statuts
        if statuts
        else [
            "depose",
            "en_instruction",
            "attente_livraison",
            "livraison_planifiee",
            "contrat_en_cours",
        ]
    )

    # Validation des valeurs de statut
    valid_statuts = {s.value for s in DossierStatusEnum}
    for s in active_statuts:
        if s not in valid_statuts:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Statut inconnu : '{s}'. Valeurs acceptées : {sorted(valid_statuts)}",
            )

    q = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle), joinedload(Dossier.client), joinedload(Dossier.pieces))
        .filter(Dossier.status.in_(active_statuts))
    )

    if type_contrat:
        if type_contrat not in {t.value for t in DossierTypeEnum}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Type inconnu : '{type_contrat}'. Valeurs acceptées : achat, lld",
            )
        q = q.filter(Dossier.type == type_contrat)

    if date_from:
        q = q.filter(Dossier.submitted_at >= date_from)
    if date_to:
        q = q.filter(Dossier.submitted_at <= date_to)

    # Tri
    if sort == "submitted_asc":
        q = q.order_by(Dossier.submitted_at.asc().nulls_last(), Dossier.id.asc())
    elif sort == "submitted_desc":
        q = q.order_by(Dossier.submitted_at.desc().nulls_first(), Dossier.id.desc())
    else:
        # created_desc — tri de création décroissant (brouillons inclus)
        q = q.order_by(Dossier.created_at.desc(), Dossier.id.desc())

    total = q.count()

    page = max(1, page)
    page_size = min(100, max(1, page_size))
    offset = (page - 1) * page_size
    dossiers = q.offset(offset).limit(page_size).all()

    items = [
        DossierBoItemOut(
            id=d.id,
            reference=d.reference,
            type=d.type,
            status=d.status.value,
            submitted_at=d.submitted_at,
            created_at=d.created_at,
            vehicle=VehicleSummaryOut(
                make=d.vehicle.make if d.vehicle else "—",
                model=d.vehicle.model if d.vehicle else "",
                year=d.vehicle.year if d.vehicle else 0,
            ),
            client=ClientSummaryOut(
                id=d.client.id,
                email=d.client.email,
                first_name=d.client.first_name,
                last_name=d.client.last_name,
            ),
            pieces_count=len(d.pieces),
        )
        for d in dossiers
    ]

    return DossierBoListOut(total=total, page=page, page_size=page_size, items=items)


# ── US-06-03 — Détail dossier gestionnaire ───────────────────────────────────

@router.get(
    "/backoffice/{dossier_id}",
    response_model=DossierBoDetailOut,
    summary="US-06-03 — Détail complet d'un dossier pour le gestionnaire",
)
def get_dossier_bo_detail(
    dossier_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> DossierBoDetailOut:
    """Retourne le détail complet d'un dossier : client, véhicule, pièces, historique.

    Accessible aux gestionnaires, superviseurs et admins uniquement.
    """
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    close_expired_lld_contract_dossiers(db)

    dossier = (
        db.query(Dossier)
        .options(
            joinedload(Dossier.client),
            joinedload(Dossier.vehicle),
            joinedload(Dossier.pieces),
            joinedload(Dossier.historique),
        )
        .filter(Dossier.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

    uploaded_map: dict[str, PieceJustificative] = {
        p.type_piece: p for p in dossier.pieces if p.type_piece in REQUIRED_PIECE_TYPES
    }
    pieces = [
        PieceBoOut(
            type_piece=cast(PieceType, t),
            uploaded=t in uploaded_map,
            filename=uploaded_map[t].filename if t in uploaded_map else None,
            uploaded_at=uploaded_map[t].uploaded_at if t in uploaded_map else None,
        )
        for t in REQUIRED_PIECE_TYPES
    ]

    historique_out = [
        HistoriqueItemOut(
            ancien_status=h.ancien_status,
            nouveau_status=h.nouveau_status,
            commentaire=h.commentaire,
            created_at=h.created_at,
        )
        for h in dossier.historique
    ]

    return DossierBoDetailOut(
        id=dossier.id,
        reference=dossier.reference,
        type=dossier.type,
        status=dossier.status.value,
        validated_at=dossier.validated_at,
        submitted_at=dossier.submitted_at,
        created_at=dossier.created_at,
        rejected_at=dossier.rejected_at,
        motif_rejet=dossier.motif_rejet,
        notes_internes=dossier.notes_internes,
        vehicle=VehicleSummaryOut(
            make=dossier.vehicle.make if dossier.vehicle else "—",
            model=dossier.vehicle.model if dossier.vehicle else "",
            year=dossier.vehicle.year if dossier.vehicle else 0,
        ),
        client=ClientSummaryOut(
            id=dossier.client.id,
            email=dossier.client.email,
            first_name=dossier.client.first_name,
            last_name=dossier.client.last_name,
        ),
        pieces=pieces,
        historique=historique_out,
        livraison=_livraison_info_out(dossier),
    )


@router.post(
    "/backoffice/{dossier_id}/planifier-livraison",
    response_model=DossierPlanifierLivraisonOut,
    summary="US-06-10 — Planifier la livraison (gestionnaire)",
)
def planifier_livraison(
    dossier_id: int,
    payload: DossierPlanifierLivraisonIn,
    db: DbSession,
    request: Request,
    access_token: str | None = Cookie(default=None),
) -> DossierPlanifierLivraisonOut:
    """Passe un dossier de ``attente_livraison`` à ``livraison_planifiee`` et notifie le client par email."""
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.client))
        .filter(Dossier.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

    if dossier.status != DossierStatusEnum.attente_livraison:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La livraison ne peut être planifiée que pour un dossier en attente de livraison.",
        )

    prevue = payload.livraison_prevue_at
    if prevue.tzinfo is None:
        prevue = prevue.replace(tzinfo=timezone.utc)
    prevue_utc = prevue.astimezone(timezone.utc)

    old_status = dossier.status.value
    dossier.status = DossierStatusEnum.livraison_planifiee
    dossier.livraison_prevue_at = prevue_utc

    db.add(
        DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=old_status,
            nouveau_status=DossierStatusEnum.livraison_planifiee.value,
            commentaire=(
                f"Livraison planifiée le {prevue_utc.isoformat()} (UTC), lieu {LIEU_LIVRAISON_DEFAUT} "
                f"par {user.first_name} {user.last_name}"
            ),
            operateur_id=user.id,
        )
    )

    audit_service.record(
        db,
        action=audit_service.DOSSIER_LIVRAISON_PLANIFIEE,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state={"status": old_status, "livraison_prevue_at": None},
        after_state={
            "status": DossierStatusEnum.livraison_planifiee.value,
            "livraison_prevue_at": prevue_utc.isoformat(),
            "livraison_lieu": LIEU_LIVRAISON_DEFAUT,
        },
    )

    db.commit()
    db.refresh(dossier)

    send_livraison_planifiee_email(
        to_email=dossier.client.email,
        dossier_reference=dossier.reference,
        livraison_prevue_at=prevue_utc,
        lieu_livraison=LIEU_LIVRAISON_DEFAUT,
        dossier_url=f"{settings.FRONTEND_BASE_URL}/mes-dossiers/{dossier.id}",
    )

    out_at = _utc_safe(dossier.livraison_prevue_at)
    assert out_at is not None

    return DossierPlanifierLivraisonOut(
        id=dossier.id,
        reference=dossier.reference,
        status=dossier.status.value,
        livraison_prevue_at=out_at,
        livraison_lieu=LIEU_LIVRAISON_DEFAUT,
    )


@router.post(
    "/backoffice/{dossier_id}/effectuer-livraison",
    response_model=DossierEffectuerLivraisonOut,
    summary="US-06-09 — Livraison effectuée : contrat en cours (LLD) ou clôturé (achat)",
)
def effectuer_livraison(
    dossier_id: int,
    db: DbSession,
    request: Request,
    access_token: str | None = Cookie(default=None),
) -> DossierEffectuerLivraisonOut:
    """LLD → ``contrat_en_cours`` avec dates ; achat → ``cloture``. La clôture LLD intervient à l'échéance du contrat."""
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.client))
        .filter(Dossier.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

    if dossier.status != DossierStatusEnum.livraison_planifiee:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La livraison ne peut être enregistrée que pour un dossier au statut « livraison planifiée ».",
        )
    if dossier.livraison_prevue_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune date de livraison planifiée : impossible d'enregistrer la livraison.",
        )

    old_status = dossier.status.value
    date_debut: date | None = None
    duree: int | None = None
    new_status: DossierStatusEnum
    if dossier.type == DossierTypeEnum.lld:
        new_status = DossierStatusEnum.contrat_en_cours
        date_debut = _date_livraison_calendar_fr(dossier.livraison_prevue_at)
        duree = LLD_DUREE_MOIS_APRES_LIVRAISON
        dossier.date_debut_contrat = date_debut
        dossier.duree_mois = duree
    else:
        new_status = DossierStatusEnum.cloture

    dossier.status = new_status

    db.add(
        DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=old_status,
            nouveau_status=new_status.value,
            commentaire=(
                f"Livraison effectuée par {user.first_name} {user.last_name} ({user.email})"
                + (
                    f" — contrat LLD en cours à compter du {date_debut} ({duree} mois)."
                    if date_debut and duree
                    else "."
                )
            ),
            operateur_id=user.id,
        )
    )

    audit_service.record(
        db,
        action=audit_service.DOSSIER_LIVRAISON_EFFECTUEE,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state={"status": old_status},
        after_state={
            "status": new_status.value,
            "date_debut_contrat": date_debut.isoformat() if date_debut else None,
            "duree_mois": duree,
        },
    )

    db.commit()
    db.refresh(dossier)

    _notify_status_change(dossier, dossier.client.email)

    return DossierEffectuerLivraisonOut(
        id=dossier.id,
        reference=dossier.reference,
        status=dossier.status.value,
        date_debut_contrat=dossier.date_debut_contrat,
        duree_mois=dossier.duree_mois,
    )


@router.get(
    "/backoffice/{dossier_id}/pieces/{type_piece}/download-url",
    response_model=PieceDownloadUrlOut,
    summary="US-06-03 — URL pré-signée pour consulter une pièce (gestionnaire)",
)
def get_piece_download_url_bo(
    dossier_id: int,
    type_piece: PieceType,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> PieceDownloadUrlOut:
    """Génère une URL pré-signée GET (10 min) pour qu'un gestionnaire consulte une pièce."""
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    dossier = db.query(Dossier).filter(Dossier.id == dossier_id).first()
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

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
    # disposition="inline" : le navigateur affiche le PDF dans l'iframe au lieu de le télécharger
    download_url = generate_download_url(
        s3_client,
        object_key=piece.s3_key,
        filename=piece.filename,
        disposition="inline",
    )
    return PieceDownloadUrlOut(download_url=download_url, filename=piece.filename)


# ── US-06-02 — Prise en charge d'un dossier ──────────────────────────────────

@router.patch(
    "/{dossier_id}/prendre-en-charge",
    response_model=DossierPrendreEnChargeOut,
    summary="US-06-02 — Prise en charge d'un dossier par le gestionnaire",
)
def prendre_en_charge(
    dossier_id: int,
    db: DbSession,
    request: Request,
    access_token: str | None = Cookie(default=None),
) -> DossierPrendreEnChargeOut:
    """Affecte le dossier au gestionnaire connecté et passe son statut à 'en_instruction'.

    Règles :
    - Le dossier doit être au statut ``depose``.
    - Le gestionnaire déjà assigné peut ré-exécuter l'action (idempotent).
    - Toute tentative sur un dossier dans un autre statut lève 409.
    """
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.client))
        .filter(Dossier.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

    if dossier.status not in (DossierStatusEnum.depose, DossierStatusEnum.en_instruction):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Impossible de prendre en charge un dossier au statut '{dossier.status.value}'. "
                "Seuls les dossiers 'depose' ou déjà 'en_instruction' sont acceptés."
            ),
        )

    # Idempotence : déjà en instruction et même gestionnaire → pas de doublon en base
    already_taken = (
        dossier.status == DossierStatusEnum.en_instruction
        and dossier.gestionnaire_id == user.id
    )

    old_status = dossier.status.value
    dossier.status = DossierStatusEnum.en_instruction
    dossier.gestionnaire_id = user.id

    if not already_taken:
        # Entrée dans l'historique du dossier
        db.add(DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=old_status,
            nouveau_status=DossierStatusEnum.en_instruction.value,
            commentaire=f"Pris en charge par {user.first_name} {user.last_name} ({user.email})",
            operateur_id=user.id,
        ))

        # Audit trail
        audit_service.record(
            db,
            action=audit_service.DOSSIER_PRIS_EN_CHARGE,
            entity_type="dossier",
            entity_id=dossier.id,
            operator=user,
            ip_address=request.client.host if request.client else None,
            before_state={"status": old_status, "gestionnaire_id": dossier.gestionnaire_id},
            after_state={
                "status": DossierStatusEnum.en_instruction.value,
                "gestionnaire_id": user.id,
                "gestionnaire_email": user.email,
            },
        )

    db.commit()
    db.refresh(dossier)

    if not already_taken:
        _notify_status_change(dossier, dossier.client.email)

    return DossierPrendreEnChargeOut(
        id=dossier.id,
        reference=dossier.reference,
        status=dossier.status.value,
        gestionnaire_id=dossier.gestionnaire_id,
    )


# ── US-06-04 — Validation d'un dossier ───────────────────────────────────────

@router.patch(
    "/{dossier_id}/valider",
    response_model=DossierValiderOut,
    summary="US-06-04 — Validation d'un dossier par le gestionnaire",
)
def valider_dossier(
    dossier_id: int,
    db: DbSession,
    request: Request,
    access_token: str | None = Cookie(default=None),
) -> DossierValiderOut:
    """Valide le instruction, génère le contrat (gabarit markdown), passe en « en_signature », notifie le client.

    Règles :
    - Le dossier doit être au statut ``en_instruction``.
    - Idempotent : déjà ``en_signature`` avec contrat en base, ou ancien statut ``valide`` (jeu de données legacy).
    - Après signature client, statut ``attente_livraison`` : nouvelle validation interdite (409).
    """
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    dossier = (
        db.query(Dossier)
        .options(
            joinedload(Dossier.client),
            joinedload(Dossier.vehicle),
            joinedload(Dossier.contrat),
        )
        .filter(Dossier.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

    if dossier.status in (
        DossierStatusEnum.attente_livraison,
        DossierStatusEnum.livraison_planifiee,
        DossierStatusEnum.contrat_en_cours,
        DossierStatusEnum.cloture,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le dossier est déjà signé, en livraison, sous contrat ou clôturé : validation impossible.",
        )

    if dossier.status == DossierStatusEnum.valide:
        return DossierValiderOut(
            id=dossier.id,
            reference=dossier.reference,
            status=dossier.status.value,
            validated_at=dossier.validated_at,
        )

    if dossier.status == DossierStatusEnum.en_signature and dossier.contrat is not None:
        return DossierValiderOut(
            id=dossier.id,
            reference=dossier.reference,
            status=dossier.status.value,
            validated_at=dossier.validated_at,
        )

    if dossier.status != DossierStatusEnum.en_instruction:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Impossible de valider un dossier au statut '{dossier.status.value}'. "
                "Le dossier doit être « en_instruction »."
            ),
        )

    old_status = dossier.status.value
    now = datetime.now(timezone.utc)
    dossier.status = DossierStatusEnum.en_signature
    dossier.validated_at = now

    if dossier.type == DossierTypeEnum.lld:
        ensure_option_rows_for_lld_dossier(db, dossier)

    cref = build_contract_reference(dossier)
    body_md = render_contract_markdown(db, dossier, contract_reference=cref)
    db.add(
        DossierContrat(
            dossier_id=dossier.id,
            reference=cref,
            body_markdown=body_md,
        )
    )

    db.add(
        DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=old_status,
            nouveau_status=DossierStatusEnum.en_signature.value,
            commentaire=f"Dossier validé par {user.first_name} {user.last_name} ({user.email}), contrat généré",
            operateur_id=user.id,
        )
    )

    audit_service.record(
        db,
        action=audit_service.DOSSIER_VALIDE,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state={"status": old_status, "validated_at": None},
        after_state={
            "status": DossierStatusEnum.en_signature.value,
            "validated_at": dossier.validated_at.isoformat(),
            "gestionnaire_email": user.email,
            "contract_reference": cref,
        },
    )

    db.commit()
    db.refresh(dossier)

    contrat_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/mes-dossiers/{dossier.id}#contrat"
    try:
        send_contract_ready_email(
            to_email=dossier.client.email,
            dossier_reference=dossier.reference,
            contrat_url=contrat_url,
        )
    except Exception:
        logger.exception("Echec envoi email contrat prêt pour dossier %s", dossier.reference)

    return DossierValiderOut(
        id=dossier.id,
        reference=dossier.reference,
        status=dossier.status.value,
        validated_at=dossier.validated_at,
    )


# ── US-06-05 — Rejet d'un dossier avec motif obligatoire ─────────────────────

_STATUTS_REJETABLES_GESTIONNAIRE = frozenset(
    {DossierStatusEnum.depose, DossierStatusEnum.en_instruction}
)


@router.patch(
    "/{dossier_id}/rejeter",
    response_model=DossierRejeterOut,
    summary="US-06-05 — Rejet d'un dossier par le gestionnaire (motif obligatoire)",
)
def rejeter_dossier(
    dossier_id: int,
    payload: DossierRejeterIn,
    db: DbSession,
    request: Request,
    access_token: str | None = Cookie(default=None),
) -> DossierRejeterOut:
    """Passe le dossier au statut « rejete », enregistre le motif, ``rejected_at``, notifie le client.

    Règles :
    - Le dossier doit être ``depose`` ou ``en_instruction``.
    - Le motif (trim) fait au moins 20 caractères (voir schéma).
    - Si déjà ``rejete``, l'appel est idempotent (pas de doublon historique / audit / email).
    """
    user = _resolve_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)

    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.client))
        .filter(Dossier.id == dossier_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")

    if dossier.status == DossierStatusEnum.rejete:
        return DossierRejeterOut(
            id=dossier.id,
            reference=dossier.reference,
            status=dossier.status.value,
            motif_rejet=dossier.motif_rejet or "",
            rejected_at=dossier.rejected_at,
        )

    if dossier.status not in _STATUTS_REJETABLES_GESTIONNAIRE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Impossible de rejeter un dossier au statut '{dossier.status.value}'. "
                "Seuls les dossiers « depose » ou « en_instruction » peuvent être rejetés."
            ),
        )

    old_status = dossier.status.value
    motif = payload.motif
    now = datetime.now(timezone.utc)
    dossier.status = DossierStatusEnum.rejete
    dossier.motif_rejet = motif
    dossier.rejected_at = now

    db.add(
        DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=old_status,
            nouveau_status=DossierStatusEnum.rejete.value,
            commentaire=(
                f"Dossier rejeté par {user.first_name} {user.last_name} ({user.email}). "
                f"Motif : {motif}"
            ),
            operateur_id=user.id,
        )
    )

    audit_service.record(
        db,
        action=audit_service.DOSSIER_REJETE,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state={"status": old_status, "motif_rejet": None},
        after_state={
            "status": DossierStatusEnum.rejete.value,
            "motif_rejet": motif,
            "rejected_at": dossier.rejected_at.isoformat(),
            "gestionnaire_email": user.email,
        },
    )

    db.commit()
    db.refresh(dossier)

    _notify_status_change(dossier, dossier.client.email, motif_rejet=motif)

    return DossierRejeterOut(
        id=dossier.id,
        reference=dossier.reference,
        status=dossier.status.value,
        motif_rejet=motif,
        rejected_at=dossier.rejected_at,
    )


@router.get("/contrats", response_model=list[ContratListItemOut])
def list_my_contrats(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> list[ContratListItemOut]:
    """Retourne les contrats LLD validés du client connecté, actifs et terminés."""
    user = _resolve_user_from_cookie(access_token, db)
    close_expired_lld_contract_dossiers(db)
    dossiers = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle))
        .filter(
            Dossier.client_id == user.id,
            Dossier.type == DossierTypeEnum.lld,
            Dossier.status.in_(
                (
                    DossierStatusEnum.valide,
                    DossierStatusEnum.attente_livraison,
                    DossierStatusEnum.livraison_planifiee,
                    DossierStatusEnum.contrat_en_cours,
                    DossierStatusEnum.cloture,
                )
            ),
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
        st_ll = build_lld_options_state(db, d)
        total_m_ht = float(st_ll.total_mensualite_ht) if st_ll else None
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
                total_mensualite_ht=total_m_ht,
            )
        )
    result.sort(key=lambda c: (not c.is_active, -(c.date_debut.toordinal() if c.date_debut else 0)))
    return result


@router.patch("/{dossier_id}/options-lld", response_model=LldOptionsPricingOut)
def patch_lld_options(
    dossier_id: int,
    payload: LldOptionsPatchIn,
    request: Request,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> LldOptionsPricingOut:
    """Met à jour les options LLD (US-07-01 / 02). Sous ``contrat_en_cours`` : avenant + email (US-06-08)."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = _get_owned_dossier(db, dossier_id=dossier_id, user_id=user.id)
    if dossier.type != DossierTypeEnum.lld:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les options LLD ne s'appliquent qu'aux dossiers de type LLD.",
        )
    if dossier.status == DossierStatusEnum.contrat_en_cours:
        expire_stale_lld_avenant_if_needed(db, dossier.id)
        if pending_unsigned_lld_avenant(db, dossier.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un avenant est déjà en attente de signature. Consultez votre e-mail ou attendez l'expiration du lien (24 h).",
            )
    if not dossier_allows_lld_option_edit(db, dossier):
        detail = "Les options ne sont pas modifiables pour ce dossier."
        if (
            dossier.status
            in (
                DossierStatusEnum.valide,
                DossierStatusEnum.attente_livraison,
                DossierStatusEnum.livraison_planifiee,
                DossierStatusEnum.contrat_en_cours,
            )
            and dossier.type == DossierTypeEnum.lld
            and not contrat_lld_est_actif(dossier)
        ):
            detail = "Les options ne peuvent plus être modifiées : le contrat est terminé."
        elif dossier.status not in (
            DossierStatusEnum.brouillon,
            DossierStatusEnum.valide,
            DossierStatusEnum.attente_livraison,
            DossierStatusEnum.livraison_planifiee,
            DossierStatusEnum.contrat_en_cours,
        ):
            detail = (
                "Les options ne peuvent être modifiées qu'en brouillon ou sur un contrat LLD actif déjà validé."
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    try:
        validate_selection_keys(db, payload.selections)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    for opt_code, sel in payload.selections.items():
        if sel and not is_lld_option_enabled(db, opt_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"L'option « {opt_code} » n'est pas disponible actuellement.",
            )
    ensure_option_rows_for_lld_dossier(db, dossier)
    rows = db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()
    rows_by_code = {r.code: r for r in rows}
    state_before = build_lld_options_state(db, dossier)
    if not state_before:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="État LLD incohérent.")
    sel_before = {str(i["code"]): bool(i["selected"]) for i in state_before.items}

    if dossier.status == DossierStatusEnum.contrat_en_cours:
        merged = merge_lld_selections_from_payload(db, dossier, payload.selections)
        if not selections_differ_from_rows(merged, rows_by_code):
            db.commit()
            db.refresh(dossier)
            st_no = build_lld_options_state(db, dossier)
            if not st_no:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="État LLD incohérent.")
            return _lld_options_pricing_out(st_no)
        raw_tok = _generate_email_verification_token()
        hashed = _hash_email_verification_token(raw_tok)
        now = datetime.now(timezone.utc)
        av = create_pending_avenant(db, dossier, merged, raw_tok, hashed, now)
        try:
            send_avenant_signature_email(
                client_email=user.email,
                dossier_reference=dossier.reference,
                avenant_reference=av.reference,
                raw_token=raw_tok,
            )
        except Exception:  # pragma: no cover
            logger.exception("Envoi email avenant dossier %s", dossier.reference)
        record_avenant_demande_audit(
            db,
            dossier=dossier,
            user=user,
            avenant=av,
            ip_address=request.client.host if request.client else None,
        )
        db.commit()
        db.refresh(dossier)
        st_pending = build_lld_options_state(db, dossier)
        if not st_pending:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="État LLD incohérent.")
        return _lld_options_pricing_out(st_pending)

    changed = False
    for row in rows:
        if row.code in payload.selections and row.selected != payload.selections[row.code]:
            row.selected = payload.selections[row.code]
            changed = True
    db.flush()
    state_after = build_lld_options_state(db, dossier)
    if not state_after:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="État LLD incohérent.")
    if not changed:
        db.commit()
        db.refresh(dossier)
        return _lld_options_pricing_out(state_after)

    audit_service.record(
        db,
        action=audit_service.LLD_OPTIONS_UPDATED,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state={
            "selections": sel_before,
            "total_mensuel_ht": state_before.total_mensualite_ht,
            "options_supplement_ht": state_before.options_supplement_ht,
        },
        after_state={
            "selections": {str(i["code"]): bool(i["selected"]) for i in state_after.items},
            "total_mensuel_ht": state_after.total_mensualite_ht,
            "options_supplement_ht": state_after.options_supplement_ht,
        },
    )
    db.commit()
    db.refresh(dossier)
    return _lld_options_pricing_out(state_after)


@router.get("/{dossier_id}/contrat", response_model=DossierContratContentOut)
def get_dossier_contrat_markdown(
    dossier_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> DossierContratContentOut:
    """Retourne le markdown du contrat : uniquement le client propriétaire du dossier (US-06-07)."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.contrat))
        .filter(Dossier.id == dossier_id, Dossier.client_id == user.id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")
    if not dossier.contrat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aucun contrat pour ce dossier.")
    c = dossier.contrat
    return DossierContratContentOut(
        reference=c.reference,
        markdown=c.body_markdown,
        signed_at=_utc_safe(c.signed_at),
    )


@router.post(
    "/{dossier_id}/contrat/demander-signature",
    status_code=status.HTTP_200_OK,
    summary="US-06-07 — Demande de signature (lien envoyé par email)",
)
def demander_signature_contrat(
    dossier_id: int,
    payload: DossierContratSignatureRequestIn,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> dict[str, str]:
    """Après acceptation dans la modale : émet un jeton hashé et envoie le lien de confirmation."""
    user = _resolve_user_from_cookie(access_token, db)
    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.client), joinedload(Dossier.contrat))
        .filter(Dossier.id == dossier_id, Dossier.client_id == user.id)
        .first()
    )
    if not dossier or not dossier.contrat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier ou contrat introuvable.")
    if dossier.status != DossierStatusEnum.en_signature:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La signature n'est demandée que lorsque le dossier est « en signature ».",
        )
    if dossier.contrat.signed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Le contrat est déjà signé.")
    if not payload.accepte:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La confirmation est requise.")

    now = datetime.now(timezone.utc)
    raw = _generate_email_verification_token()
    dossier.contrat.signature_token_hash = _hash_email_verification_token(raw)
    dossier.contrat.signature_token_sent_at = now
    dossier.contrat.signature_token_expires_at = now + timedelta(hours=24)
    db.commit()

    confirm_url = (
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/confirm-contract-signature?token={raw}"
    )
    try:
        send_contract_signature_link_email(
            to_email=dossier.client.email,
            dossier_reference=dossier.reference,
            confirmation_link=confirm_url,
        )
    except Exception:
        logger.exception("Echec envoi email lien signature dossier %s", dossier.reference)
    return {"message": "Un email avec le lien de validation de signature vous a été envoyé."}


@router.get("/{dossier_id}", response_model=DossierDetailOut)
def get_dossier_detail(
    dossier_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> DossierDetailOut:
    """Retourne le détail complet d'un dossier : infos véhicule, checklist, historique et motif de rejet."""
    user = _resolve_user_from_cookie(access_token, db)
    close_expired_lld_contract_dossiers(db)
    dossier = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle), joinedload(Dossier.historique), joinedload(Dossier.contrat))
        .filter(Dossier.id == dossier_id, Dossier.client_id == user.id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable")
    if dossier.type == DossierTypeEnum.lld:
        ensure_option_rows_for_lld_dossier(db, dossier)
        db.commit()
        db.refresh(dossier)
    return _client_dossier_detail_out(db, dossier)


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
    request: Request,
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
    old_status = dossier.status.value
    dossier.status = DossierStatusEnum.depose
    dossier.submitted_at = datetime.now(timezone.utc)
    audit_service.record(
        db,
        action=audit_service.DOSSIER_SUBMITTED,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=request.client.host if request.client else None,
        before_state={"status": old_status, "reference": dossier.reference},
        after_state={"status": DossierStatusEnum.depose.value, "submitted_at": dossier.submitted_at.isoformat()},
    )
    db.commit()
    db.refresh(dossier)
    _notify_status_change(dossier, user.email)
    dossier_detail = (
        db.query(Dossier)
        .options(joinedload(Dossier.vehicle), joinedload(Dossier.historique))
        .filter(Dossier.id == dossier_id, Dossier.client_id == user.id)
        .first()
    )
    assert dossier_detail is not None
    return _client_dossier_detail_out(db, dossier_detail)


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
