"""Service d'audit trail — append-only.

Usage :
    from app.services import audit as audit_service

    audit_service.record(
        db,
        action="USER_CREATED",
        entity_type="user",
        entity_id=user.id,
        operator=current_user,
        ip_address=request.client.host if request.client else None,
        after_state={"email": user.email, "role": user.role.value},
    )
    db.commit()  # l'appelant gère la transaction
"""
from __future__ import annotations

import decimal
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.user import User


def _json_safe(value: Any) -> Any:
    """Convertit les types non-JSON-serialisables issus de SQLAlchemy/Python."""
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value


def _normalize_state(state: dict[str, Any] | None) -> dict[str, Any] | None:
    if state is None:
        return None
    return {k: _json_safe(v) for k, v in state.items()}

# Constantes d'action — seules valeurs admises dans AuditTrail.action
USER_CREATED = "USER_CREATED"
USER_DELETED = "USER_DELETED"
CLIENT_DATA_ERASURE_REQUESTED = "CLIENT_DATA_ERASURE_REQUESTED"
USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
VEHICLE_CREATED = "VEHICLE_CREATED"
VEHICLE_UPDATED = "VEHICLE_UPDATED"
VEHICLE_LLD_TOGGLED = "VEHICLE_LLD_TOGGLED"
VEHICLE_ARCHIVED = "VEHICLE_ARCHIVED"
VEHICLE_RESTORED = "VEHICLE_RESTORED"
DOSSIER_SUBMITTED = "DOSSIER_SUBMITTED"
DOSSIER_PRIS_EN_CHARGE = "DOSSIER_PRIS_EN_CHARGE"
DOSSIER_VALIDE = "DOSSIER_VALIDE"
DOSSIER_REJETE = "DOSSIER_REJETE"
DOSSIER_LIVRAISON_PLANIFIEE = "DOSSIER_LIVRAISON_PLANIFIEE"
DOSSIER_LIVRAISON_EFFECTUEE = "DOSSIER_LIVRAISON_EFFECTUEE"
CONTRAT_SIGNE_ELECTRONIQUEMENT = "CONTRAT_SIGNE_ELECTRONIQUEMENT"
LLD_OPTIONS_UPDATED = "LLD_OPTIONS_UPDATED"
LLD_AVENANT_DEMANDE = "LLD_AVENANT_DEMANDE"
LLD_AVENANT_SIGNE = "LLD_AVENANT_SIGNE"


def record(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: int,
    operator: User,
    ip_address: str | None,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any],
) -> AuditTrail:
    """Ajoute une entrée dans l'audit trail sans la committer.

    Le commit reste de la responsabilité de l'appelant afin que la mutation
    métier et l'entrée d'audit soient dans la même transaction atomique.
    """
    entry = AuditTrail(
        created_at=datetime.now(timezone.utc),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        operator_id=operator.id,
        operator_email=operator.email,
        operator_role=operator.role.value,
        ip_address=ip_address,
        before_state=_normalize_state(before_state),
        after_state=_normalize_state(after_state) or {},
    )
    db.add(entry)
    return entry
