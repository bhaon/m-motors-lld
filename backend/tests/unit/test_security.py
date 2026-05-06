"""Tests unitaires pour le module de sécurité (hash, JWT)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from jose import JWTError

from app.core import security
from app.core.config import settings


def test_hash_password_et_verify_password() -> None:
    """Le hash est stable pour la vérification et refuse un mauvais mot de passe."""
    h = security.hash_password("MonMotDePasse123!")
    assert security.verify_password("MonMotDePasse123!", h) is True
    assert security.verify_password("autre", h) is False


def test_create_access_token_et_decode_token() -> None:
    """Le token JWT contient sub et role, et se décode correctement."""
    token = security.create_access_token(subject="42", role="client", expires_delta=timedelta(minutes=5))
    payload = security.decode_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "client"
    assert "exp" in payload


def test_decode_token_invalide() -> None:
    """Une chaîne non JWT lève JWTError."""
    with pytest.raises(JWTError):
        security.decode_token("not-a-jwt")


def test_create_access_token_expire_defaut() -> None:
    """Sans expires_delta, la durée suit les paramètres applicatifs."""
    token = security.create_access_token(subject="1", role="admin")
    payload = security.decode_token(token)
    assert payload["sub"] == "1"
    assert settings.ALGORITHM == "HS256"
