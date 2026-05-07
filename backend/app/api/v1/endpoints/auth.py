"""Endpoints d'inscription et de confirmation email."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from jose import JWTError

from app.core.config import settings
from app.core.deps import DbSession
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.models.user import RoleEnum, User
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    CurrentUserResponse,
    EmailVerificationResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationEmailRequest,
    ResendVerificationEmailResponse,
    UpdateProfileRequest,
    UpdateProfileResponse,
)
from app.services.emailing import send_verification_email

router = APIRouter(prefix="/auth", tags=["Authentification"])
GENERIC_LOGIN_ERROR = "Email ou mot de passe invalide."
EMAIL_NOT_VERIFIED_ERROR = (
    "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail."
)


def _generate_email_verification_token() -> str:
    """Génère un token aléatoire URL-safe pour la confirmation email."""
    return secrets.token_urlsafe(48)


def _hash_email_verification_token(token: str) -> str:
    """Calcule un hash SHA-256 du token pour stockage sécurisé."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_email_verification(user: User, *, now: datetime) -> None:
    """
    (Re)génère un token de confirmation, le stocke en base et envoie l'email.

    Contrainte: le token brut n'est jamais stocké (hash SHA-256 uniquement).
    """
    raw_token = _generate_email_verification_token()
    user.email_verified = False
    user.email_verification_token = _hash_email_verification_token(raw_token)
    user.email_verification_sent_at = now
    user.email_verification_expires_at = now + timedelta(hours=24)
    send_verification_email(to_email=user.email, confirmation_link=_build_confirmation_link(raw_token))


def _build_confirmation_link(token: str) -> str:
    """Construit l'URL de confirmation utilisée dans l'email de validation."""
    return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/confirm-email?token={token}"


def _is_token_expired(expires_at: datetime | None, now: datetime) -> bool:
    """Retourne True si la date d'expiration est passée, en gérant naïf/aware."""
    if expires_at is None:
        return False
    if expires_at.tzinfo is None:
        return now.replace(tzinfo=None) > expires_at
    return now > expires_at


def _is_secure_cookie() -> bool:
    """Active Secure quand le frontend est servi en HTTPS."""
    return settings.FRONTEND_BASE_URL.startswith("https://")


def _resolve_user_from_token(token: str | None, db: DbSession) -> User:
    """Résout l'utilisateur courant à partir d'un JWT, sinon lève 401."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise.")
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide.")
        user_id = int(str(sub))
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide.")

    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise.")
    return user


def _issue_email_revalidation(user: User) -> None:
    """Déclenche une nouvelle validation email après changement d'adresse."""
    now = datetime.now(timezone.utc)
    _issue_email_verification(user, now=now)


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
    send_verification_email(to_email=payload.email, confirmation_link=confirmation_link)

    return RegisterResponse(
        message="Inscription reussie. Un email de confirmation vous a ete envoye pour activer votre compte.",
    )


@router.post("/login", response_model=LoginResponse)
def login_client(payload: LoginRequest, response: Response, db: DbSession) -> LoginResponse:
    """Authentifie un client par email/mot de passe et pose un cookie JWT HTTP-only."""
    user = db.query(User).filter(User.email == payload.email, User.deleted_at.is_(None)).first()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)
    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=EMAIL_NOT_VERIFIED_ERROR)

    token = create_access_token(subject=str(user.id), role=user.role.value)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=_is_secure_cookie(),
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    return LoginResponse(message="Connexion reussie.")


@router.post("/logout", response_model=LogoutResponse)
def logout_client(response: Response) -> LogoutResponse:
    """Supprime le cookie d'authentification pour déconnecter l'utilisateur."""
    response.delete_cookie(key="access_token", path="/")
    return LogoutResponse(message="Deconnexion reussie.")


@router.post("/resend-confirmation", response_model=ResendVerificationEmailResponse)
def resend_confirmation_email(payload: ResendVerificationEmailRequest, db: DbSession) -> ResendVerificationEmailResponse:
    """Réémet l'email de confirmation quand l'utilisateur n'a pas encore validé son email."""
    user = db.query(User).filter(User.email == payload.email, User.deleted_at.is_(None)).first()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)
    if user.email_verified:
        return ResendVerificationEmailResponse(message="Votre email est deja confirme.")

    now = datetime.now(timezone.utc)
    _issue_email_verification(user, now=now)
    db.commit()
    return ResendVerificationEmailResponse(message="Un nouvel email de confirmation vous a ete envoye.")


@router.get("/me", response_model=CurrentUserResponse)
def get_current_authenticated_user(db: DbSession, access_token: str | None = Cookie(default=None)) -> CurrentUserResponse:
    """Retourne l'utilisateur authentifié à partir du cookie HTTP-only."""
    user = _resolve_user_from_token(access_token, db)
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        role=user.role.value,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        email_verified=user.email_verified,
    )


@router.put("/profile", response_model=UpdateProfileResponse)
def update_profile(
    payload: UpdateProfileRequest,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> UpdateProfileResponse:
    """Met à jour le profil et impose une revalidation en cas de changement d'email."""
    user = _resolve_user_from_token(access_token, db)

    email_changed = payload.email != user.email
    if email_changed:
        existing = db.query(User).filter(User.email == payload.email, User.id != user.id, User.deleted_at.is_(None)).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Un compte existe déjà avec cet email.")

    user.first_name = payload.first_name
    user.last_name = payload.last_name
    user.phone = payload.phone
    user.email = payload.email
    if email_changed:
        _issue_email_revalidation(user)

    db.commit()
    return UpdateProfileResponse(
        message=(
            "Profil mis a jour. Un email de verification a ete envoye a votre nouvelle adresse."
            if email_changed
            else "Profil mis a jour avec succes."
        )
    )


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> ChangePasswordResponse:
    """Change le mot de passe après vérification de l'ancien mot de passe."""
    user = _resolve_user_from_token(access_token, db)
    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ancien mot de passe invalide.")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return ChangePasswordResponse(message="Mot de passe mis a jour avec succes.")


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
    if _is_token_expired(user.email_verification_expires_at, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de confirmation expire.")

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_sent_at = None
    user.email_verification_expires_at = None
    db.commit()
    return EmailVerificationResponse(message="Votre email a ete confirme avec succes.")
