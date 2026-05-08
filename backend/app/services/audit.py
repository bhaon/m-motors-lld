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

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.user import User

# Constantes d'action — seules valeurs admises dans AuditTrail.action
USER_CREATED = "USER_CREATED"
USER_DELETED = "USER_DELETED"
USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
VEHICLE_CREATED = "VEHICLE_CREATED"
VEHICLE_UPDATED = "VEHICLE_UPDATED"
VEHICLE_ARCHIVED = "VEHICLE_ARCHIVED"
DOSSIER_SUBMITTED = "DOSSIER_SUBMITTED"


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
        before_state=before_state,
        after_state=after_state,
    )
    db.add(entry)
    return entry
