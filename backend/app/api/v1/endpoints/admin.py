"""Endpoints d'administration — réservés aux administrateurs."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Cookie, HTTPException, Query, status

from app.core.deps import DbSession, enforce_role, get_user_from_cookie
from app.core.security import hash_password
from app.models.user import RoleEnum, User
from app.schemas.admin import (
    RoleChangeIn,
    RoleChangeOut,
    UserAdminOut,
    UserCreateIn,
    UserCreateOut,
)

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[UserAdminOut]:
    """Liste tous les utilisateurs (actifs et inactifs) — admin uniquement."""
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.admin)

    users = (
        db.query(User)
        .filter(User.deleted_at.is_(None))
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return users


@router.post("/users", response_model=UserCreateOut, status_code=status.HTTP_201_CREATED)
def create_user_admin(
    payload: UserCreateIn,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> UserCreateOut:
    """Crée un compte utilisateur avec le rôle choisi — admin uniquement."""
    current_admin = get_user_from_cookie(access_token, db)
    enforce_role(current_admin, RoleEnum.admin)

    existing = db.query(User).filter(User.email == payload.email, User.deleted_at.is_(None)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte existe déjà avec cet email.",
        )

    now = datetime.now(timezone.utc)
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        birth_date=date(1990, 1, 1),
        role=payload.role,
        is_active=True,
        email_verified=True,
        cgu_accepted_at=now,
        privacy_accepted_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserCreateOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        message=f"Compte {user.role.value} créé avec succès.",
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_admin(
    user_id: int,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> None:
    """Supprime (soft-delete) un utilisateur — admin uniquement."""
    current_admin = get_user_from_cookie(access_token, db)
    enforce_role(current_admin, RoleEnum.admin)

    target = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable.",
        )
    if target.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de supprimer son propre compte.",
        )

    target.deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.patch("/users/{user_id}/role", response_model=RoleChangeOut)
def change_user_role(
    user_id: int,
    payload: RoleChangeIn,
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> RoleChangeOut:
    """Modifie le rôle d'un utilisateur — admin uniquement.

    L'administrateur ne peut pas modifier son propre rôle.
    """
    current_admin = get_user_from_cookie(access_token, db)
    enforce_role(current_admin, RoleEnum.admin)

    target = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable.",
        )
    if target.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de modifier son propre rôle.",
        )

    target.role = payload.role
    db.commit()
    return RoleChangeOut(
        message="Rôle mis à jour avec succès.",
        user_id=target.id,
        new_role=target.role.value,
    )
