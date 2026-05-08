"""Endpoints d'administration — réservés aux administrateurs."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Cookie, HTTPException, Query, Request, status

from app.core.deps import DbSession, enforce_role, get_user_from_cookie
from app.core.security import hash_password
from app.models.audit import AuditTrail
from app.models.user import RoleEnum, User
from app.schemas.admin import (
    RoleChangeIn,
    RoleChangeOut,
    UserAdminOut,
    UserCreateIn,
    UserCreateOut,
)
from app.schemas.audit import AuditTrailOut
from app.services import audit as audit_service

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
    return [UserAdminOut.model_validate(user) for user in users]


@router.post("/users", response_model=UserCreateOut, status_code=status.HTTP_201_CREATED)
def create_user_admin(
    payload: UserCreateIn,
    db: DbSession,
    request: Request,
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
    db.flush()
    audit_service.record(
        db,
        action=audit_service.USER_CREATED,
        entity_type="user",
        entity_id=user.id,
        operator=current_admin,
        ip_address=request.client.host if request.client else None,
        before_state=None,
        after_state={
            "id": user.id,
            "email": user.email,
            "role": user.role.value,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email_verified": user.email_verified,
        },
    )
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
    request: Request,
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

    before_state = {
        "id": target.id,
        "email": target.email,
        "role": target.role.value,
        "first_name": target.first_name,
        "last_name": target.last_name,
        "is_active": target.is_active,
    }
    target.deleted_at = datetime.now(timezone.utc)
    audit_service.record(
        db,
        action=audit_service.USER_DELETED,
        entity_type="user",
        entity_id=target.id,
        operator=current_admin,
        ip_address=request.client.host if request.client else None,
        before_state=before_state,
        after_state={"deleted_at": target.deleted_at.isoformat()},
    )
    db.commit()


@router.patch("/users/{user_id}/role", response_model=RoleChangeOut)
def change_user_role(
    user_id: int,
    payload: RoleChangeIn,
    db: DbSession,
    request: Request,
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

    old_role = target.role.value
    target.role = payload.role
    audit_service.record(
        db,
        action=audit_service.USER_ROLE_CHANGED,
        entity_type="user",
        entity_id=target.id,
        operator=current_admin,
        ip_address=request.client.host if request.client else None,
        before_state={"role": old_role},
        after_state={"role": target.role.value},
    )
    db.commit()
    return RoleChangeOut(
        message="Rôle mis à jour avec succès.",
        user_id=target.id,
        new_role=target.role.value,
    )


@router.get("/audit-trail", response_model=list[AuditTrailOut])
def list_audit_trail(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
) -> list[AuditTrailOut]:
    """Consulte l'audit trail — admin uniquement, lecture seule, append-only."""
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.admin)

    q = db.query(AuditTrail).order_by(AuditTrail.created_at.desc())
    if action:
        q = q.filter(AuditTrail.action == action)
    if entity_type:
        q = q.filter(AuditTrail.entity_type == entity_type)
    entries = q.offset(skip).limit(limit).all()
    return [AuditTrailOut.model_validate(entry) for entry in entries]
