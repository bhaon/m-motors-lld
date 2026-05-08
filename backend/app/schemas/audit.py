"""Schémas Pydantic pour l'exposition de l'audit trail."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AuditTrailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    action: str
    entity_type: str
    entity_id: int
    operator_id: int
    operator_email: str
    operator_role: str
    ip_address: Optional[str] = None
    before_state: Optional[dict[str, Any]] = None
    after_state: dict[str, Any]
