"""Tests légers sur la configuration chargée."""

from __future__ import annotations

from app.core.config import settings


def test_settings_chargees() -> None:
    """Les paramètres critiques sont présents (CI injecte SECRET_KEY / DATABASE_URL)."""
    assert settings.APP_NAME
    assert settings.SECRET_KEY
    assert settings.DATABASE_URL
