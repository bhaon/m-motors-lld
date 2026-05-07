"""Schémas de validation pour l'inscription et la connexion client."""

from __future__ import annotations

from datetime import date
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

PASSWORD_REGEX = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$")
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    """Corps de requête pour créer un compte client."""

    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=12, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    birth_date: date
    accepted_cgu: bool
    accepted_privacy_policy: bool

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        """Valide le format email avec une règle simple et robuste."""
        normalized = value.strip().lower()
        if not EMAIL_REGEX.match(normalized):
            raise ValueError("Format d'email invalide.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        """Valide la politique de mot de passe (12+, majuscule, chiffre, spécial)."""
        if not PASSWORD_REGEX.match(value):
            raise ValueError("Le mot de passe ne respecte pas la politique de sécurité.")
        return value

    @field_validator("accepted_cgu", "accepted_privacy_policy")
    @classmethod
    def validate_mandatory_consent(cls, value: bool) -> bool:
        """Impose l'acceptation explicite des consentements légaux."""
        if not value:
            raise ValueError("Ce consentement est obligatoire.")
        return value


class RegisterResponse(BaseModel):
    """Réponse standard après inscription d'un compte client."""

    message: str


class LoginRequest(BaseModel):
    """Corps de requête pour authentifier un utilisateur."""

    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Normalise l'email pour fiabiliser la recherche en base."""
        return value.strip().lower()


class LoginResponse(BaseModel):
    """Réponse standard après authentification réussie."""

    message: str


class LogoutResponse(BaseModel):
    """Réponse standard après déconnexion."""

    message: str


class ResendVerificationEmailRequest(BaseModel):
    """Corps de requête pour réémettre un email de confirmation."""

    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Normalise l'email pour fiabiliser la recherche en base."""
        return value.strip().lower()


class ResendVerificationEmailResponse(BaseModel):
    """Réponse standard après réémission de l'email de confirmation."""

    message: str


class CurrentUserResponse(BaseModel):
    """Représentation du profil utilisateur connecté."""

    id: int
    email: str
    role: str
    first_name: str
    last_name: str
    phone: str | None
    email_verified: bool


class UpdateProfileRequest(BaseModel):
    """Corps de requête pour modifier les informations de profil."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    email: str = Field(min_length=5, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Normalise l'email pour homogénéiser les comparaisons."""
        normalized = value.strip().lower()
        if not EMAIL_REGEX.match(normalized):
            raise ValueError("Format d'email invalide.")
        return normalized

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        """Supprime les espaces superflus sur les noms."""
        return value.strip()

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        """Convertit une chaîne vide en null pour le stockage."""
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class UpdateProfileResponse(BaseModel):
    """Réponse standard après mise à jour du profil."""

    message: str


class ChangePasswordRequest(BaseModel):
    """Corps de requête pour changer le mot de passe du compte."""

    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        """Applique la politique de mot de passe sur le nouveau mot de passe."""
        if not PASSWORD_REGEX.match(value):
            raise ValueError("Le mot de passe ne respecte pas la politique de sécurité.")
        return value


class ChangePasswordResponse(BaseModel):
    """Réponse standard après changement de mot de passe."""

    message: str


class EmailVerificationResponse(BaseModel):
    """Réponse standard après validation du lien de confirmation email."""

    message: str
    model_config = ConfigDict(from_attributes=True)
