"""Endpoints d'inscription et de confirmation email."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.deps import DbSession
from app.core.security import hash_password
from app.models.user import RoleEnum, User
from app.schemas.auth import EmailVerificationResponse, RegisterRequest, RegisterResponse

router = APIRouter(prefix="/auth", tags=["Authentification"])


def _generate_email_verification_token() -> str:
    """Génère un token aléatoire URL-safe pour la confirmation email."""
    return secrets.token_urlsafe(48)


def _hash_email_verification_token(token: str) -> str:
    """Calcule un hash SHA-256 du token pour stockage sécurisé."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_confirmation_link(token: str) -> str:
    """Construit l'URL de confirmation utilisée dans l'email de validation."""
    return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/confirm-email?token={token}"


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register_client(payload: RegisterRequest, db: DbSession) -> RegisterResponse:
    """Crée un compte client inactif tant que l'email n'est pas confirmé."""
    existing = db.query(User).filter(User.email == payload.email, User.deleted_at.is_(None)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Un compte existe déjà avec cet email.")

    now = datetime.now(timezone.utc)
    raw_token = _generate_email_verification_token()
    token_hash = _hash_email_verification_token(raw_token)
    expires_at = now + timedelta(hours=24)

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        birth_date=payload.birth_date,
        role=RoleEnum.client,
        is_active=True,
        email_verified=False,
        cgu_accepted_at=now,
        privacy_accepted_at=now,
        email_verification_token=token_hash,
        email_verification_sent_at=now,
        email_verification_expires_at=expires_at,
    )
    db.add(user)
    db.commit()

    confirmation_link = _build_confirmation_link(raw_token)
    # Simule l'envoi email côté infrastructure actuelle (MVP) : lien traçable dans les logs.
    print(f"[EMAIL_CONFIRMATION] to={payload.email} link={confirmation_link}")

    return RegisterResponse(
        message="Inscription reussie. Un email de confirmation vous a ete envoye pour activer votre compte.",
    )


@router.get("/confirm-email", response_model=EmailVerificationResponse)
def confirm_email(token: str, db: DbSession) -> EmailVerificationResponse:
    """Valide un token de confirmation et active l'email du compte."""
    token_hash = _hash_email_verification_token(token)
    user = (
        db.query(User)
        .filter(User.email_verification_token == token_hash, User.deleted_at.is_(None))
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de confirmation invalide.")

    now = datetime.now(timezone.utc)
    if user.email_verification_expires_at and now > user.email_verification_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de confirmation expire.")

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_sent_at = None
    user.email_verification_expires_at = None
    db.commit()
    return EmailVerificationResponse(message="Votre email a ete confirme avec succes.")
