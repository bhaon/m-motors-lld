"""Contrat généré depuis le gabarit markdown (US-06-07)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.dossier import Dossier


class DossierContrat(Base):
    """Corps du contrat et jeton de confirmation de signature (hash, comme l'email)."""

    __tablename__ = "dossier_contrats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dossier_id: Mapped[int] = mapped_column(
        ForeignKey("dossiers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    reference: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    signature_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    signature_token_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    signature_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dossier: Mapped["Dossier"] = relationship("Dossier", back_populates="contrat")
