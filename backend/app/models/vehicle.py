from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base
import enum


class MoteurEnum(str, enum.Enum):
    essence = "Essence"
    diesel = "Diesel"
    hybride = "Hybride"
    electrique = "Électrique"


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    make: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    km: Mapped[int] = mapped_column(Integer, nullable=False)
    moteur: Mapped[MoteurEnum] = mapped_column(Enum(MoteurEnum), nullable=False)
    prix: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    lld: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mensualite: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    img: Mapped[str] = mapped_column(Text, nullable=False)

    # Specs (stored as flat columns for query performance)
    spec_carburant: Mapped[str] = mapped_column(String(100), nullable=False)
    spec_boite: Mapped[str] = mapped_column(String(100), nullable=False)
    spec_couleur: Mapped[str] = mapped_column(String(100), nullable=False)
    spec_places: Mapped[int] = mapped_column(Integer, default=5)
    spec_puissance: Mapped[str] = mapped_column(String(50), nullable=False)

    # Catalogue management (US-05-02, US-05-04)
    visible_catalogue: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # soft delete
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relations
    options: Mapped[list["VehicleOption"]] = relationship(
        "VehicleOption", back_populates="vehicle", cascade="all, delete-orphan"
    )
    photos: Mapped[list["VehiclePhoto"]] = relationship(
        "VehiclePhoto", back_populates="vehicle", cascade="all, delete-orphan", order_by="VehiclePhoto.order"
    )
    dossiers: Mapped[list["Dossier"]] = relationship("Dossier", back_populates="vehicle")


class VehicleOption(Base):
    __tablename__ = "vehicle_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    surcharge: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)  # montant mensuel HT

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="options")


class VehiclePhoto(Base):
    __tablename__ = "vehicle_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    is_main: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)

    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="photos")


# Import here to avoid circular imports
from app.models.dossier import Dossier  # noqa: E402, F401
