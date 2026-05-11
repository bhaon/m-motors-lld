from datetime import datetime
from datetime import date
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.config import settings
from app.db.session import Base
from app.db.types import PgcryptoEncryptedDate, PgcryptoEncryptedText
from app.utils.client_pii import client_email_search_hash
import enum


class RoleEnum(str, enum.Enum):
    client = "client"
    gestionnaire = "gestionnaire"
    superviseur = "superviseur"
    admin = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_users_email_hash_active",
            "email_hash",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(
        PgcryptoEncryptedText(settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY, length=255),
        nullable=False,
    )
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(
        PgcryptoEncryptedText(settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY, length=255),
        nullable=False,
    )
    last_name: Mapped[str] = mapped_column(
        PgcryptoEncryptedText(settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY, length=255),
        nullable=False,
    )
    birth_date: Mapped[date] = mapped_column(
        PgcryptoEncryptedDate(settings.PII_ENCRYPTION_KEY or settings.SECRET_KEY),
        nullable=False,
    )
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

    @validates("email")
    def _sync_email_hash(self, _key: str, value: str) -> str:
        """Maintient l'empreinte SHA-256 pour les recherches lorsque l'email applicatif change."""
        self.email_hash = client_email_search_hash(value)
        return value


from app.models.dossier import Dossier  # noqa: E402, F401
