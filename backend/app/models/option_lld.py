"""Options LLD souscrites par dossier (US-07-01)."""

from __future__ import annotations

import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.dossier import Dossier


class OptionLldCode(str, enum.Enum):
    """Codes stables des quatre options métier LLD."""

    assurance = "assurance"
    assistance = "assistance"
    entretien = "entretien"
    controle_technique = "controle_technique"


class OptionLld(Base):
    """Une ligne par couple (dossier, option) ; ``selected`` indique le choix client."""

    __tablename__ = "options_lld"
    __table_args__ = (UniqueConstraint("dossier_id", "code", name="uq_options_lld_dossier_code"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    dossier_id: Mapped[int] = mapped_column(ForeignKey("dossiers.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    selected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    surcout_mensuel_ht: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    dossier: Mapped["Dossier"] = relationship("Dossier", back_populates="options_lld_rows")
