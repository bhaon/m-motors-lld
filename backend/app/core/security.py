from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# Création du contexte de hashage des mots de passe
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash un mot de passe."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Vérifie un mot de passe hashé."""
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """Crée un token d'accès."""
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Décode un token d'accès."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
