from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, RoleEnum

bearer = HTTPBearer()

DbSession = Annotated[Session, Depends(get_db)]
BearerCredentials = Annotated[HTTPAuthorizationCredentials, Depends(bearer)]


# ── Auth Bearer (back-office vehicules.py) ────────────────────────────────────

def get_current_user(
    credentials: BearerCredentials,
    db: DbSession,
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
        user_id = str(sub)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide ou expiré")

    user = db.query(User).filter(User.id == int(user_id), User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur inactif ou supprimé")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: RoleEnum):
    def checker(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Rôle requis : {[r.value for r in roles]}",
            )
        return current_user

    return checker


require_gestionnaire = require_role(RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin)
require_superviseur = require_role(RoleEnum.superviseur, RoleEnum.admin)
require_admin = require_role(RoleEnum.admin)

GestionnaireUser = Annotated[User, Depends(require_gestionnaire)]
SuperviseurUser = Annotated[User, Depends(require_superviseur)]
AdminUser = Annotated[User, Depends(require_admin)]


# ── Auth Cookie — utilitaires partagés (US-11-03) ─────────────────────────────

def get_user_from_cookie(access_token: str | None, db: Session) -> User:
    """Résout l'utilisateur depuis un cookie JWT et vérifie la cohérence du claim rôle.

    Défense en profondeur : si le rôle dans le JWT diffère du rôle en base
    (ex. token antérieur à une révocation de privilège), la requête est rejetée.
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise.",
        )
    try:
        payload = decode_token(access_token)
        user_id = int(str(payload.get("sub")))
        role_claim: str | None = payload.get("role")
    except (JWTError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide.",
        )

    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise.",
        )

    if role_claim is not None and role_claim != user.role.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rôle JWT incohérent avec le rôle en base.",
        )

    return user


def enforce_role(user: User, *allowed_roles: RoleEnum) -> None:
    """Lève 403 si le rôle de l'utilisateur n'est pas parmi les rôles autorisés."""
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Accès réservé aux rôles : {[r.value for r in allowed_roles]}",
        )
