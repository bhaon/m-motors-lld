"""Schemas back-office : reporting et gestion des utilisateurs."""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.user import RoleEnum

_PASSWORD_RE = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*\-_+=?]).{8,}$")


class UserAdminOut(BaseModel):
    """Profil utilisateur exposé aux administrateurs."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str
    last_name: str
    role: RoleEnum
    is_active: bool
    email_verified: bool
    created_at: datetime | None = None


class UserCreateIn(BaseModel):
    """Payload de création d'un compte utilisateur par un administrateur."""

    email: str
    password: str
    first_name: str
    last_name: str
    role: RoleEnum = RoleEnum.superviseur

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(
                "Mot de passe trop faible. Requis : 8 caractères minimum, "
                "1 majuscule, 1 chiffre, 1 caractère spécial (!@#$%^&*-_+=?)."
            )
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Adresse email invalide.")
        return v

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Ce champ est obligatoire.")
        return v


class UserCreateOut(BaseModel):
    """Confirmation de création d'un utilisateur."""

    id: int
    email: str
    role: str
    message: str


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
