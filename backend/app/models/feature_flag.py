"""Feature flags génériques (clé → booléen) — US-07-03 activation options LLD sans colonne dédiée."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FeatureFlag(Base):
    """Interrupteur métier persistant ; les options LLD utilisent des clés ``lld_option.<code>.enabled``."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value_bool: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
