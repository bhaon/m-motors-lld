"""
Job : alerte email superviseur pour contrats LLD finissant dans 3 mois (US-06-11).

Exécution : ``python -m app.jobs.notify_contracts_ending_soon``
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.services.contract_retention_alerts import process_contract_retention_alerts

logger = logging.getLogger(__name__)


def main() -> int:
    """Point d'entrée CLI : envoie les alertes rétention éligibles."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    db = SessionLocal()
    try:
        sent = process_contract_retention_alerts(db, now=datetime.now(timezone.utc))
        logger.info("Alertes rétention contrat envoyées : %s", sent)
        return 0
    except Exception:
        logger.exception("Échec du job alertes rétention contrat")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
