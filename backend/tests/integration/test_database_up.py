"""Smoke test : la base configurée répond (utilisé en CI avec PostgreSQL)."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text


def test_database_select_one() -> None:
    """Vérifie qu'une connexion SQLAlchemy peut exécuter SELECT 1."""
    url = os.environ.get("DATABASE_URL", "")
    assert url, "DATABASE_URL doit être défini pour les tests d'intégration"
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar_one() == 1
