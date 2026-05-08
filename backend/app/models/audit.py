"""Modèle AuditTrail — registre immuable des mutations sensibles.

Règles d'immuabilité :
  - Aucun endpoint UPDATE ni DELETE n'est exposé pour cette table.
  - En production (PostgreSQL), ajouter en complément :
      CREATE RULE no_update_audit AS ON UPDATE TO audit_trail DO INSTEAD NOTHING;
      CREATE RULE no_delete_audit AS ON DELETE TO audit_trail DO INSTEAD NOTHING;
  - Rétention minimum 5 ans (politique de purge dans docs/US-11-04-audit-trail.md).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AuditTrail(Base):
    __tablename__ = "audit_trail"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Nature de l'action
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Opérateur (dénormalisé pour conserver l'historique même après suppression)
    operator_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    operator_email: Mapped[str] = mapped_column(String(255), nullable=False)
    operator_role: Mapped[str] = mapped_column(String(32), nullable=False)

    # Contexte réseau
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    # Contenu (JSON libre pour rester stable face aux évolutions de schéma)
    before_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    after_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
