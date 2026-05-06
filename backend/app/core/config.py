"""Configuration applicative : secrets et URL issus uniquement des variables d'environnement."""

from __future__ import annotations

import json
from urllib.parse import quote_plus
from typing import Annotated, Any, List

from pydantic import BeforeValidator, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_allowed_origins() -> List[str]:
    """Valeurs CORS par défaut (non sensibles) si la configuration est absente ou vide."""
    return [
        "https://localhost:8443",
        "https://127.0.0.1:8443",
    ]


def _strip_nonempty_string_list(items: list[Any]) -> List[str]:
    """Normalise une liste d'origines : chaînes non vides après strip."""
    return [str(x).strip() for x in items if str(x).strip()]


def _try_parse_origins_json_array(s: str) -> List[str] | None:
    """
    Si ``s`` est un tableau JSON valide, renvoie la liste d'origines nettoyées.
    Renvoie ``None`` pour repasser par le parseur CSV (JSON invalide ou type inattendu).
    """
    if not s.startswith("["):
        return None
    try:
        parsed = json.loads(s)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    return _strip_nonempty_string_list(parsed)


def _parse_allowed_origins(v: Any) -> List[str]:
    """
    Construit la liste CORS depuis une liste Python, du JSON (tableau) ou une chaîne CSV.
    Valeurs par défaut non sensibles si la variable est absente ou vide.
    """
    default = _default_allowed_origins()
    if v is None:
        return default
    if isinstance(v, list):
        out = _strip_nonempty_string_list(v)
        return out or default
    if not isinstance(v, str):
        return default
    s = v.strip()
    if not s:
        return default
    json_origins = _try_parse_origins_json_array(s)
    if json_origins is not None:
        return json_origins or default
    parts = [x.strip() for x in s.split(",") if x.strip()]
    return parts or default


class Settings(BaseSettings):
    """Paramètres chargés depuis l'environnement (fichier `.env` optionnel en local)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "M-Motors API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    DATABASE_URL: str | None = Field(
        default=None,
        description="URL SQLAlchemy synchrone (ex. postgresql://user:pass@host:5432/db).",
    )
    POSTGRES_DB: str | None = Field(default=None, description="Nom de la base PostgreSQL.")
    POSTGRES_USER: str | None = Field(default=None, description="Utilisateur PostgreSQL.")
    POSTGRES_PASSWORD: str | None = Field(default=None, description="Mot de passe PostgreSQL.")
    POSTGRES_HOST: str = Field(default="postgresql", description="Hôte PostgreSQL.")
    POSTGRES_PORT: int = Field(default=5432, description="Port PostgreSQL.")
    SECRET_KEY: str = Field(
        ...,
        description="Secret pour signer les JWT — obligatoire (variable d'environnement uniquement).",
    )

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    ALLOWED_ORIGINS: Annotated[List[str], BeforeValidator(_parse_allowed_origins)] = Field(
        default_factory=lambda: [
            "https://localhost:8443",
            "https://127.0.0.1:8443",
        ],
    )

    @model_validator(mode="after")
    def _ensure_database_url(self) -> "Settings":
        """
        Garantit une DATABASE_URL valide.

        Priorité:
        1) DATABASE_URL explicite si fournie
        2) Construction à partir de POSTGRES_* pour éviter les divergences de secrets
        """
        if self.DATABASE_URL:
            return self
        if self.POSTGRES_DB and self.POSTGRES_USER and self.POSTGRES_PASSWORD:
            encoded_password = quote_plus(self.POSTGRES_PASSWORD)
            self.DATABASE_URL = (
                f"postgresql://{self.POSTGRES_USER}:{encoded_password}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
            return self
        raise ValueError(
            "Configuration DB invalide: fournir DATABASE_URL ou POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD."
        )

    @property
    def database_url(self) -> str:
        """Retourne l’URL SQLAlchemy effective (toujours définie si ``Settings()`` a réussi sans ``ValueError``)."""
        url = self.DATABASE_URL
        if url is None:
            raise RuntimeError("DATABASE_URL absente après validation — incohérence interne.")
        return url


# Les champs requis sont fournis par l’environnement ; mypy ne le déduit pas.
settings = Settings()  # type: ignore[call-arg]
