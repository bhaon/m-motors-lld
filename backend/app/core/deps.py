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
