"""Tests des dépendances FastAPI (contrôle de rôle)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.models.user import RoleEnum
from tests.conftest import create_user


def test_require_role_autorise_si_role_conforme(db: Session) -> None:
    """Un utilisateur admin passe la garde require_role(admin)."""
    u = create_user(db, role=RoleEnum.admin)
    guard = require_role(RoleEnum.admin)
    assert guard(current_user=u) is u


def test_require_role_refuse_si_role_insuffisant(db: Session) -> None:
    """Un client reçoit 403 si seul le rôle admin est autorisé."""
    u = create_user(db, role=RoleEnum.client)
    guard = require_role(RoleEnum.admin)
    with pytest.raises(HTTPException) as exc:
        guard(current_user=u)
    assert exc.value.status_code == 403


def test_require_role_gestionnaire_accepte_superviseur(db: Session) -> None:
    """Le gestionnaire, superviseur et admin passent require_gestionnaire."""
    from app.core.deps import require_gestionnaire

    for role in (RoleEnum.gestionnaire, RoleEnum.superviseur, RoleEnum.admin):
        u = create_user(db, role=role)
        assert require_gestionnaire(current_user=u) is u  # type: ignore[misc]


def test_require_superviseur_et_admin(db: Session) -> None:
    """Couverture des garde-fous superviseur et admin seuls."""
    from app.core.deps import require_admin, require_superviseur

    sup = create_user(db, role=RoleEnum.superviseur)
    adm = create_user(db, role=RoleEnum.admin)
    assert require_superviseur(current_user=sup) is sup  # type: ignore[misc]
    assert require_superviseur(current_user=adm) is adm  # type: ignore[misc]
    assert require_admin(current_user=adm) is adm  # type: ignore[misc]

    cli = create_user(db, role=RoleEnum.client)
    with pytest.raises(HTTPException):
        require_superviseur(current_user=cli)  # type: ignore[misc]
    with pytest.raises(HTTPException):
        require_admin(current_user=cli)  # type: ignore[misc]
