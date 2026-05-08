"""
Job : envoi des rappels email pour dossiers brouillon non soumis depuis N jours (US-03-05).

Exécution : ``python -m app.jobs.remind_stale_draft_dossiers``
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.services.draft_reminders import process_stale_draft_reminders

logger = logging.getLogger(__name__)


def main() -> int:
    """Point d'entrée CLI : traite les brouillons éligibles et journalise le nombre de rappels."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    db = SessionLocal()
    try:
        sent = process_stale_draft_reminders(db, now=datetime.now(timezone.utc))
        logger.info("Rappels brouillon envoyés : %s", sent)
        return 0
    except Exception:
        logger.exception("Échec du job rappels brouillon")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
