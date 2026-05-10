"""Schéma initial — création des tables à partir des modèles SQLAlchemy.

Première révision du projet : sans fichier de migration, ``upgrade head`` ne faisait rien
et la table ``vehicles`` (entre autres) n'existait pas en PostgreSQL.

Revision ID: 001_initial
Revises:
Create Date: 2026-05-04
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Crée les tables du schéma initial (hors tables ajoutées par des migrations ultérieures)."""
    bind = op.get_bind()
    from app.db.session import Base

    import app.models.dossier  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.vehicle  # noqa: F401

    # Exclure les tables gérées par des migrations postérieures pour éviter les DuplicateTable.
    # Ajouter ici tout nouveau modèle dont la migration dédiée crée la table.
    MANAGED_BY_LATER_MIGRATIONS = {"audit_trail"}
    tables = [t for t in Base.metadata.sorted_tables if t.name not in MANAGED_BY_LATER_MIGRATIONS]
    Base.metadata.create_all(bind=bind, tables=tables)


def downgrade() -> None:
    """Supprime les tables ORM (ordre géré par SQLAlchemy selon les FK)."""
    bind = op.get_bind()
    from app.db.session import Base

    import app.models.dossier  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.vehicle  # noqa: F401

    Base.metadata.drop_all(bind=bind)
