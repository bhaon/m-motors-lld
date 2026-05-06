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
    """Crée toutes les tables ORM sur une base vide."""
    bind = op.get_bind()
    from app.db.session import Base

    import app.models.dossier  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.vehicle  # noqa: F401

    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    """Supprime les tables ORM (ordre géré par SQLAlchemy selon les FK)."""
    bind = op.get_bind()
    from app.db.session import Base

    import app.models.dossier  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.vehicle  # noqa: F401

    Base.metadata.drop_all(bind=bind)
