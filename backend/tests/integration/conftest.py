"""Fixtures et helpers partagés pour les tests d'intégration.

Ces tests tournent contre une vraie base PostgreSQL (DATABASE_URL fourni par CI).
En CI (``.github/workflows/ci.yaml``), ils s'exécutent avec **pytest sur le runner**
et le service Postgres du workflow — pas via ``docker run`` sur l'image backend :
l'image de production démarre toujours Gunicorn (ENTRYPOINT) et n'inclut pas pytest.

Le ``reset_db`` du ``tests/conftest.py`` parent recrée le schéma entre chaque test
(``drop_all`` / ``create_all``) : ne pas le remplacer par un no-op, sinon les tables
n'existent jamais sur Postgres (relation "users" does not exist).
Chaque test utilise en plus des emails uniques pour éviter les collisions.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.models.user import RoleEnum, User
from app.models.vehicle import MoteurEnum, Vehicle


# ── Helpers ────────────────────────────────────────────────────────────────────

def unique_email(prefix: str = "it") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}@example.com"


def create_staff_user(
    db: Session,
    role: RoleEnum,
    email: str | None = None,
    password: str = "StaffPass123!",
) -> User:
    """Crée directement en base un utilisateur staff (gestionnaire/admin/superviseur)."""
    now = datetime.now(timezone.utc)
    u = User(
        email=email or unique_email(role.value),
        hashed_password=hash_password(password),
        first_name="Staff",
        last_name=role.value.capitalize(),
        birth_date=date(1985, 6, 15),
        role=role,
        email_verified=True,
        is_active=True,
        cgu_accepted_at=now,
        privacy_accepted_at=now,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def staff_cookie(user: User) -> str:
    """Retourne un access_token JWT valide pour un utilisateur staff."""
    return create_access_token(subject=str(user.id), role=user.role.value)


def register_and_login(
    client: TestClient,
    email: str,
    password: str = "ClientPass123!",
) -> str:
    """Inscrit un client, force la vérification email, connecte et renvoie l'access_token."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": "Integration",
            "last_name": "Client",
            "birth_date": "1992-03-15",
            "accepted_cgu": True,
            "accepted_privacy_policy": True,
        },
    )
    from app.utils.client_pii import client_email_search_hash
    from app.models.user import User as UserModel
    db = SessionLocal()
    try:
        u = db.query(UserModel).filter(UserModel.email_hash == client_email_search_hash(email)).first()
        assert u is not None
        u.email_verified = True
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    cookie = resp.headers.get("set-cookie", "")
    return cookie.split("access_token=")[1].split(";")[0]


def create_vehicle_in_db(db: Session, **overrides: object) -> Vehicle:
    """Crée un véhicule minimal directement en base."""
    defaults: dict = {
        "make": "Renault",
        "model": "Clio",
        "year": 2022,
        "km": 15000,
        "moteur": MoteurEnum.essence,
        "prix": 16990.0,
        "lld": False,
        "mensualite": None,
        "img": "https://example.com/clio.jpg",
        "spec_carburant": "Essence",
        "spec_boite": "Manuelle",
        "spec_couleur": "Blanc",
        "spec_places": 5,
        "spec_puissance": "90 ch",
        "visible_catalogue": True,
        "archived": False,
    }
    defaults.update(overrides)
    v = Vehicle(**defaults)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v
