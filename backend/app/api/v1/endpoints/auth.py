"""Endpoints d'inscription et de confirmation email."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from jose import JWTError

from app.core.config import settings
from app.core.deps import DbSession
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum
from app.models.dossier_contract import DossierContrat
from app.models.lld_avenant import LldAvenant
from app.models.user import RoleEnum, User
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    CurrentUserResponse,
    EmailVerificationResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    ResendVerificationEmailRequest,
    ResendVerificationEmailResponse,
    UpdateProfileRequest,
    UpdateProfileResponse,
)
from app.services import audit as audit_service
from app.services.emailing import send_password_reset_email, send_verification_email
from app.services.lld_avenant_flow import finalize_avenant_signature

router = APIRouter(prefix="/auth", tags=["Authentification"])
GENERIC_LOGIN_ERROR = "Email ou mot de passe invalide."
EMAIL_NOT_VERIFIED_ERROR = (
    "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail."
)
FORGOT_PASSWORD_MESSAGE = (
    "Si un compte existe avec cet email, un lien de reinitialisation a ete envoye."
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


def _build_password_reset_link(token: str) -> str:
    """Construit l'URL frontend de réinitialisation de mot de passe."""
    return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={token}"


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


def _issue_password_reset(user: User, *, now: datetime) -> None:
    """
    Génère un token de réinitialisation (hashé en base) et envoie l'email associé.

    Durée de validité : 1 heure.
    """
    raw_token = _generate_email_verification_token()
    user.password_reset_token = _hash_email_verification_token(raw_token)
    user.password_reset_sent_at = now
    user.password_reset_expires_at = now + timedelta(hours=1)
    send_password_reset_email(to_email=user.email, reset_link=_build_password_reset_link(raw_token))


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


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: DbSession) -> ForgotPasswordResponse:
    """Déclenche l'envoi d'un email de réinitialisation sans révéler l'existence du compte."""
    user = db.query(User).filter(User.email == payload.email, User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        return ForgotPasswordResponse(message=FORGOT_PASSWORD_MESSAGE)

    now = datetime.now(timezone.utc)
    _issue_password_reset(user, now=now)
    db.commit()
    return ForgotPasswordResponse(message=FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(payload: ResetPasswordRequest, db: DbSession) -> ResetPasswordResponse:
    """Réinitialise le mot de passe via un token à usage unique expirant au bout d'une heure."""
    token_hash = _hash_email_verification_token(payload.token)
    user = (
        db.query(User)
        .filter(User.password_reset_token == token_hash, User.deleted_at.is_(None))
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de reinitialisation invalide.")

    now = datetime.now(timezone.utc)
    if _is_token_expired(user.password_reset_expires_at, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de reinitialisation expire.")

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_sent_at = None
    user.password_reset_expires_at = None
    db.commit()
    return ResetPasswordResponse(message="Mot de passe reinitialise avec succes.")


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


@router.get("/confirm-contract-signature", response_model=EmailVerificationResponse)
def confirm_contract_signature(token: str, db: DbSession, request: Request) -> EmailVerificationResponse:
    """Valide le jeton reçu par email et finalise la signature (statut « attente de livraison »)."""
    token_hash = _hash_email_verification_token(token)
    ctr = (
        db.query(DossierContrat)
        .filter(DossierContrat.signature_token_hash == token_hash)
        .first()
    )
    if not ctr:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de signature invalide.")

    now = datetime.now(timezone.utc)
    if _is_token_expired(ctr.signature_token_expires_at, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de signature expire.")

    dossier = db.query(Dossier).filter(Dossier.id == ctr.dossier_id).first()
    if not dossier or dossier.status != DossierStatusEnum.en_signature or ctr.signed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de signature invalide.")

    old_status = dossier.status.value
    dossier.status = DossierStatusEnum.attente_livraison
    ctr.signed_at = now
    ctr.signature_token_hash = None
    ctr.signature_token_sent_at = None
    ctr.signature_token_expires_at = None

    db.add(
        DossierHistorique(
            dossier_id=dossier.id,
            ancien_status=old_status,
            nouveau_status=DossierStatusEnum.attente_livraison.value,
            commentaire="Signature électronique du contrat confirmée via lien email.",
            operateur_id=None,
        )
    )
    client_user = db.query(User).filter(User.id == dossier.client_id).first()
    if client_user:
        audit_service.record(
            db,
            action=audit_service.CONTRAT_SIGNE_ELECTRONIQUEMENT,
            entity_type="dossier",
            entity_id=dossier.id,
            operator=client_user,
            ip_address=request.client.host if request.client else None,
            before_state={"status": old_status},
            after_state={
                "status": DossierStatusEnum.attente_livraison.value,
                "contract_reference": ctr.reference,
            },
        )
    db.commit()
    return EmailVerificationResponse(message="Votre signature sur le contrat a ete enregistree.")


@router.get("/confirm-avenant-signature", response_model=EmailVerificationResponse)
def confirm_avenant_signature(token: str, db: DbSession, request: Request) -> EmailVerificationResponse:
    """Valide le jeton e-mail et applique les options de l'avenant LLD (US-06-08)."""
    token_hash = _hash_email_verification_token(token)
    av = db.query(LldAvenant).filter(LldAvenant.signature_token_hash == token_hash).first()
    if not av:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de signature invalide.")

    now = datetime.now(timezone.utc)
    if _is_token_expired(av.signature_token_expires_at, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de signature expire.")

    dossier = db.query(Dossier).filter(Dossier.id == av.dossier_id).first()
    if not dossier or dossier.status != DossierStatusEnum.contrat_en_cours or av.signed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lien de signature invalide.")

    client_user = db.query(User).filter(User.id == dossier.client_id).first()
    finalize_avenant_signature(
        db,
        avenant=av,
        dossier=dossier,
        now=now,
        client_user=client_user,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return EmailVerificationResponse(
        message="Votre avenant a ete signe electroniquement. Votre location mensuelle est mise a jour."
    )
