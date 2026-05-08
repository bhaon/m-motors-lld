"""Schemas back-office : reporting et gestion des utilisateurs (US-11-03)."""

from pydantic import BaseModel, ConfigDict
from datetime import datetime

from app.models.user import RoleEnum


class UserAdminOut(BaseModel):
    """Profil utilisateur exposé aux administrateurs."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: RoleEnum
    is_active: bool
    email_verified: bool
    created_at: datetime | None = None


class RoleChangeIn(BaseModel):
    """Payload pour la mise à jour du rôle d'un utilisateur."""

    role: RoleEnum


class RoleChangeOut(BaseModel):
    """Confirmation de changement de rôle."""

    message: str
    user_id: int
    new_role: str


class ReportingSummaryOut(BaseModel):
    """Tableau de bord statistiques réservé aux superviseurs et administrateurs."""

    total_dossiers: int
    by_status: dict[str, int]
    by_type: dict[str, int]
    total_clients: int
