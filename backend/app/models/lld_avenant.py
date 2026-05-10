"""Avenant aux options LLD en cours de contrat : texte, sélections proposées, jeton de signature (US-06-08)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.dossier import Dossier


class LldAvenant(Base):
    """Avenant généré lors d'un changement d'options sur un LLD ``contrat_en_cours`` : signature requise."""

    __tablename__ = "lld_avenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dossier_id: Mapped[int] = mapped_column(
        ForeignKey("dossiers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    selections: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    signature_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    signature_token_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    signature_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dossier: Mapped["Dossier"] = relationship("Dossier", back_populates="lld_avenants")
