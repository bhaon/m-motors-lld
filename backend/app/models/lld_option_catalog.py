"""Catalogue métier options LLD et historique des tarifs (US-07-03)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class LldOptionCatalog(Base):
    """Une option éditoriale : libellé et description (prix dans ``LldOptionPriceHistory``)."""

    __tablename__ = "lld_option_catalog"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    price_events: Mapped[list["LldOptionPriceHistory"]] = relationship(
        "LldOptionPriceHistory",
        back_populates="catalog_row",
        cascade="all, delete-orphan",
    )


class LldOptionPriceHistory(Base):
    """Historique immuable des tarifs mensuels HT pour une option."""

    __tablename__ = "lld_option_price_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    option_code: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("lld_option_catalog.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price_ht: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    catalog_row: Mapped["LldOptionCatalog"] = relationship("LldOptionCatalog", back_populates="price_events")
