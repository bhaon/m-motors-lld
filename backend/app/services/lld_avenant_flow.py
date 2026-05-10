"""Création d’avenant LLD, envoi email, application après signature (US-06-08)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.dossier import Dossier, DossierHistorique
from app.models.lld_avenant import LldAvenant
from app.models.option_lld import OptionLld
from app.models.user import User
from app.services import audit as audit_service
from app.services.avenant_fill import render_avenant_markdown
from app.services.emailing import send_avenant_signature_link_email
from app.services.lld_options_catalog import (
    ensure_option_rows_for_lld_dossier,
    list_merged_selections_for_storage,
    pending_unsigned_lld_avenant,
)


def next_avenant_seq(db: Session, dossier_id: int) -> int:
    """Numéro d’avenant (1-based) pour ce dossier."""
    n = db.query(LldAvenant).filter(LldAvenant.dossier_id == dossier_id).count()
    return n + 1


def build_avenant_reference(dossier: Dossier, seq: int) -> str:
    """Référence lisible type ``AVA-DOS-xxx-01``."""
    return f"AVA-{dossier.reference}-{seq:02d}"


def expire_stale_lld_avenant_if_needed(db: Session, dossier_id: int) -> None:
    """Supprime un avenant en attente dont le jeton a expiré pour permettre une nouvelle demande."""
    av = pending_unsigned_lld_avenant(db, dossier_id)
    if not av or not av.signature_token_expires_at:
        return
    now = datetime.now(timezone.utc)
    exp = av.signature_token_expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp >= now:
        return
    db.delete(av)
    db.flush()


def apply_avenant_selections_to_rows(db: Session, dossier: Dossier, selections: dict[str, bool]) -> None:
    """Recopie les cases cochées validées sur les lignes ``OptionLld``."""
    ensure_option_rows_for_lld_dossier(db, dossier)
    rows = db.query(OptionLld).filter(OptionLld.dossier_id == dossier.id).all()
    for row in rows:
        if row.code in selections:
            row.selected = bool(selections[row.code])
    db.flush()


def create_pending_avenant(
    db: Session,
    dossier: Dossier,
    merged_selections: dict[str, bool],
    raw_token: str,
    token_hash: str,
    now: datetime,
) -> LldAvenant:
    """Persiste l’avenant avec corps markdown et jeton de signature (24 h)."""
    seq = next_avenant_seq(db, dossier.id)
    ref = build_avenant_reference(dossier, seq)
    body = render_avenant_markdown(
        db,
        dossier,
        avenant_reference=ref,
        avenant_num=seq,
        merged_selections=merged_selections,
    )
    av = LldAvenant(
        dossier_id=dossier.id,
        reference=ref,
        body_markdown=body,
        selections=list_merged_selections_for_storage(merged_selections),
        signature_token_hash=token_hash,
        signature_token_sent_at=now,
        signature_token_expires_at=now + timedelta(hours=24),
    )
    db.add(av)
    db.flush()
    return av


def send_avenant_signature_email(
    *,
    client_email: str,
    dossier_reference: str,
    avenant_reference: str,
    raw_token: str,
) -> None:
    """Envoie le lien de confirmation (page front ``confirm-avenant-signature``)."""
    link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/confirm-avenant-signature?token={raw_token}"
    send_avenant_signature_link_email(
        to_email=client_email,
        dossier_reference=dossier_reference,
        avenant_reference=avenant_reference,
        confirmation_link=link,
    )


def record_avenant_demande_audit(
    db: Session,
    *,
    dossier: Dossier,
    user: User,
    avenant: LldAvenant,
    ip_address: str | None,
) -> None:
    """Audit : demande d’avenant avec options proposées."""
    audit_service.record(
        db,
        action=audit_service.LLD_AVENANT_DEMANDE,
        entity_type="dossier",
        entity_id=dossier.id,
        operator=user,
        ip_address=ip_address,
        after_state={"avenant_reference": avenant.reference, "status": "pending_signature"},
    )


def finalize_avenant_signature(
    db: Session,
    *,
    avenant: LldAvenant,
    dossier: Dossier,
    now: datetime,
    client_user: User | None,
    ip_address: str | None,
) -> None:
    """Applique les options, clôt l’avenant, historique + audit."""
    sel_map = dict(avenant.selections) if isinstance(avenant.selections, dict) else {}
    apply_avenant_selections_to_rows(db, dossier, {str(k): bool(v) for k, v in sel_map.items()})
    avenant.signed_at = now
    avenant.signature_token_hash = None
    avenant.signature_token_sent_at = None
    avenant.signature_token_expires_at = None
    db.flush()
    db.add(
        DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=dossier.status.value,
            nouveau_status=dossier.status.value,
            commentaire=(
                f"Avenant {avenant.reference} signé électroniquement — options LLD mises à jour."
            ),
            operateur_id=None,
        )
    )
    if client_user:
        audit_service.record(
            db,
            action=audit_service.LLD_AVENANT_SIGNE,
            entity_type="dossier",
            entity_id=dossier.id,
            operator=client_user,
            ip_address=ip_address,
            before_state={"avenant_reference": avenant.reference, "pending": True},
            after_state={"avenant_reference": avenant.reference, "signed": True},
        )
