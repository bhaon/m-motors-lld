"""Configuration applicative : secrets et URL issus uniquement des variables d'environnement."""

from __future__ import annotations

import json
from urllib.parse import urlparse
from urllib.parse import quote_plus
from typing import Any, List

from pydantic import Field, model_validator
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
    PII_ENCRYPTION_KEY: str | None = Field(
        default=None,
        description="Clé pgcrypto pour chiffrer les données personnelles au repos.",
    )
    FRONTEND_BASE_URL: str = Field(
        default="https://netdevops.fr",
        description="URL publique du frontend utilisée pour les liens de confirmation email.",
    )
    RESEND_API_KEY: str | None = Field(
        default=None,
        description="Clé API Resend pour l'envoi d'emails transactionnels.",
    )
    RESEND_FROM_EMAIL: str = Field(
        default="M-Motors <no-reply@mmotors.dev>",
        description="Adresse expéditeur utilisée pour les emails de vérification.",
    )
    S3_ENDPOINT_URL: str = Field(
        default="http://minio:9000",
        description="Endpoint S3 compatible (MinIO en cluster).",
    )
    S3_PUBLIC_ENDPOINT_URL: str | None = Field(
        default=None,
        description="Endpoint S3 public utilisé pour les URLs pré-signées exposées au navigateur.",
    )
    S3_REGION: str = Field(default="us-east-1", description="Région S3 logique.")
    S3_BUCKET: str = Field(default="mmotors-documents", description="Bucket de stockage des pièces justificatives.")
    S3_ACCESS_KEY: str = Field(default="minioadmin", description="Access key S3.")
    S3_SECRET_KEY: str = Field(default="minioadmin", description="Secret key S3.")
    S3_PRESIGN_EXPIRES_SECONDS: int = Field(default=600, description="Durée de validité de l'URL pré-signée.")

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    ALLOWED_ORIGINS: str = Field(
        default="https://localhost:8443,https://127.0.0.1:8443",
        description="Origines CORS autorisées (CSV ou JSON array).",
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
            if not self.PII_ENCRYPTION_KEY:
                self.PII_ENCRYPTION_KEY = self.SECRET_KEY
            return self
        if self.POSTGRES_DB and self.POSTGRES_USER and self.POSTGRES_PASSWORD:
            encoded_password = quote_plus(self.POSTGRES_PASSWORD)
            self.DATABASE_URL = (
                f"postgresql://{self.POSTGRES_USER}:{encoded_password}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
            if not self.PII_ENCRYPTION_KEY:
                self.PII_ENCRYPTION_KEY = self.SECRET_KEY
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

    @property
    def s3_public_endpoint_url(self) -> str | None:
        """Retourne un endpoint S3 public valide (http/https) ou ``None``."""
        value = self.S3_PUBLIC_ENDPOINT_URL
        if not value:
            return None
        cleaned = value.strip().rstrip("/")
        if not cleaned:
            return None
        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None
        return cleaned

    @property
    def allowed_origins(self) -> List[str]:
        """Retourne la liste CORS normalisée à partir de ``ALLOWED_ORIGINS``."""
        return _parse_allowed_origins(self.ALLOWED_ORIGINS)


# Les champs requis sont fournis par l’environnement ; mypy ne le déduit pas.
settings = Settings()  # type: ignore[call-arg]
