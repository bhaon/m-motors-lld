"""Fixtures communes : base SQLite, tables et client FastAPI."""

from __future__ import annotations

import os
import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-minimum-32bytes!")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///./pytest_unit.db")

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.main import application  # noqa: E402
from app.models.user import RoleEnum, User  # noqa: E402
from app.models.vehicle import MoteurEnum, Vehicle  # noqa: E402


@pytest.fixture(autouse=True)
def reset_db() -> Generator[None, None, None]:
    """Réinitialise le schéma entre chaque test pour des données isolées."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Client HTTP avec lifespan (création des tables si besoin)."""
    with TestClient(application) as c:
        yield c


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Session SQLAlchemy directe pour préparer des données."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def unique_email() -> str:
    """Génère un email unique pour éviter les collisions entre tests."""
    return f"user_{uuid.uuid4().hex[:16]}@example.com"


def create_user(
    db: Session,
    *,
    role: RoleEnum = RoleEnum.client,
    email: str | None = None,
    password: str = "SecretMotDePasse1!",
    is_active: bool = True,
) -> User:
    """Crée un utilisateur persisté et renvoie l'entité."""
    u = User(
        email=email or unique_email(),
        hashed_password=hash_password(password),
        first_name="Test",
        last_name="User",
        role=role,
        email_verified=True,
        is_active=is_active,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def auth_header(user: User) -> dict[str, str]:
    """En-tête Authorization Bearer pour l'utilisateur donné."""
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def create_vehicle(db: Session, **kwargs: object) -> Vehicle:
    """Crée un véhicule catalogue minimal."""
    defaults: dict = {
        "make": "Peugeot",
        "model": "208",
        "year": 2023,
        "km": 10000,
        "moteur": MoteurEnum.essence,
        "prix": 18990.0,
        "lld": False,
        "mensualite": None,
        "img": "https://example.com/v.jpg",
        "spec_carburant": "Essence",
        "spec_boite": "Manuelle",
        "spec_couleur": "Gris",
        "spec_places": 5,
        "spec_puissance": "100 ch",
        "visible_catalogue": True,
        "archived": False,
    }
    defaults.update(kwargs)
    v = Vehicle(**defaults)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v
