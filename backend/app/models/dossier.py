from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base
import enum

# Référence SQLAlchemy vers la clé primaire de ``users`` (évite de dupliquer le littéral).
USERS_ID_FK = "users.id"


class DossierTypeEnum(str, enum.Enum):
    achat = "achat"
    lld = "lld"


class DossierStatusEnum(str, enum.Enum):
    brouillon = "brouillon"
    depose = "depose"
    en_instruction = "en_instruction"
    valide = "valide"
    rejete = "rejete"
    annule = "annule"


class Dossier(Base):
    __tablename__ = "dossiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reference: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    type: Mapped[DossierTypeEnum] = mapped_column(Enum(DossierTypeEnum), nullable=False)
    status: Mapped[DossierStatusEnum] = mapped_column(
        Enum(DossierStatusEnum), default=DossierStatusEnum.brouillon, nullable=False, index=True
    )

    # Relations
    client_id: Mapped[int] = mapped_column(ForeignKey(USERS_ID_FK), nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False, index=True)
    gestionnaire_id: Mapped[Optional[int]] = mapped_column(ForeignKey(USERS_ID_FK), nullable=True)

    # Instruction
    motif_rejet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes_internes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamps métier
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relations
    client: Mapped["User"] = relationship("User", foreign_keys=[client_id], back_populates="dossiers")
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="dossiers")
    pieces: Mapped[list["PieceJustificative"]] = relationship(
        "PieceJustificative", back_populates="dossier", cascade="all, delete-orphan"
    )
    historique: Mapped[list["DossierHistorique"]] = relationship(
        "DossierHistorique",
        back_populates="dossier",
        cascade="all, delete-orphan",
        order_by="DossierHistorique.created_at",
    )


class PieceJustificative(Base):
    __tablename__ = "pieces_justificatives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dossier_id: Mapped[int] = mapped_column(ForeignKey("dossiers.id", ondelete="CASCADE"), nullable=False, index=True)
    type_piece: Mapped[str] = mapped_column(String(50), nullable=False)  # cni, permis, revenus, domicile, rib
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dossier: Mapped["Dossier"] = relationship("Dossier", back_populates="pieces")


class DossierHistorique(Base):
    __tablename__ = "dossier_historique"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dossier_id: Mapped[int] = mapped_column(ForeignKey("dossiers.id", ondelete="CASCADE"), nullable=False, index=True)
    ancien_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    nouveau_status: Mapped[str] = mapped_column(String(30), nullable=False)
    commentaire: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operateur_id: Mapped[Optional[int]] = mapped_column(ForeignKey(USERS_ID_FK), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dossier: Mapped["Dossier"] = relationship("Dossier", back_populates="historique")


from app.models.vehicle import Vehicle  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401
