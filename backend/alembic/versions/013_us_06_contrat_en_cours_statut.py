"""US — Valeur ENUM ``contrat_en_cours`` et migration des LLD mal clôturés trop tôt.

Revision ID: 013_us_06_contrat_en_cours
Revises: 012_us_06_09_cloture
Create Date: 2026-05-10
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from alembic import op
from sqlalchemy import text
from sqlalchemy.orm import Session

revision = "013_us_06_contrat_en_cours"
down_revision = "012_us_06_09_cloture"
branch_labels = None
depends_on = None

_PG_ENUM_NAME = "dossierstatusenum"


def _add_months(d: date, months: int) -> date:
    """Aligné sur ``lld_dossier_lifecycle._add_months``."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            text(f"""
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = '{_PG_ENUM_NAME}' AND e.enumlabel = 'contrat_en_cours'
  ) THEN
    ALTER TYPE {_PG_ENUM_NAME} ADD VALUE 'contrat_en_cours';
  END IF;
END
$do$;
""")
        )

    # Repasse en « contrat en cours » les LLD encore sous garantie contractuelle.
    from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum

    session = Session(bind=bind)
    try:
        today = date.today()
        for d in (
            session.query(Dossier)
            .filter(
                Dossier.type == DossierTypeEnum.lld,
                Dossier.status == DossierStatusEnum.cloture,
                Dossier.date_debut_contrat.isnot(None),
                Dossier.duree_mois.isnot(None),
            )
            .all()
        ):
            assert d.date_debut_contrat is not None and d.duree_mois is not None
            fin = _add_months(d.date_debut_contrat, d.duree_mois)
            if today <= fin:
                d.status = DossierStatusEnum.contrat_en_cours
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    """PostgreSQL : pas de retrait de valeur ENUM ; données non inversées."""
    pass
