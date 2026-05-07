from datetime import datetime
from datetime import date
from typing import Optional
from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.config import settings
from app.db.types import PgcryptoEncryptedText
from app.db.session import Base
import enum


class RoleEnum(str, enum.Enum):
    client = "client"
    gestionnaire = "gestionnaire"
    superviseur = "superviseur"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(
        PgcryptoEncryptedText(settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY, length=255),
        nullable=False,
    )
    last_name: Mapped[str] = mapped_column(
        PgcryptoEncryptedText(settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY, length=255),
        nullable=False,
    )
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    role: Mapped[RoleEnum] = mapped_column(Enum(RoleEnum), default=RoleEnum.client, nullable=False)

    # EP-02 — compte actif / email validé
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # EP-11 — RGPD soft delete
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cgu_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    privacy_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    email_verification_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    email_verification_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verification_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    password_reset_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    password_reset_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    password_reset_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    dossiers: Mapped[list["Dossier"]] = relationship(
        "Dossier",
        back_populates="client",
        foreign_keys="Dossier.client_id",
    )


from app.models.dossier import Dossier  # noqa: E402, F401
