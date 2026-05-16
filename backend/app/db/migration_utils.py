"""Utilitaires Alembic — garde idempotente (schéma 001 via create_all + modèles actuels)."""

from __future__ import annotations

import sqlalchemy as sa


def has_table(bind: sa.engine.Connection, table_name: str) -> bool:
    """Retourne True si la table existe déjà."""
    return table_name in sa.inspect(bind).get_table_names()


def has_column(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> bool:
    """Retourne True si la colonne existe déjà."""
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def column_type_name(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> str | None:
    """Retourne le nom de type SQL (en minuscule) d'une colonne, sinon None."""
    inspector = sa.inspect(bind)
    for col in inspector.get_columns(table_name):
        if col["name"] == column_name:
            return str(col["type"]).lower()
    return None


def column_is_nullable(bind: sa.engine.Connection, *, table_name: str, column_name: str) -> bool:
    """Indique si la colonne accepte NULL (défaut True si colonne absente)."""
    inspector = sa.inspect(bind)
    for col in inspector.get_columns(table_name):
        if col["name"] == column_name:
            return bool(col.get("nullable", True))
    return True
