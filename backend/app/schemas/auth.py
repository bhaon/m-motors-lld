"""Schémas de validation pour l'inscription client."""

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


class EmailVerificationResponse(BaseModel):
    """Réponse standard après validation du lien de confirmation email."""

    message: str
    model_config = ConfigDict(from_attributes=True)
