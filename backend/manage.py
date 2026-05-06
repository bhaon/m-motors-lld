#!/usr/bin/env python3
"""
Point d'entrée type « manage.py » (Django) pour l'API FastAPI : migrations Alembic, etc.
Utilisé notamment par le conteneur d'init Kubernetes (db-migrate).
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

# Répertoire du backend (où se trouvent alembic.ini et manage.py)
_BACK_ROOT = os.path.dirname(os.path.abspath(__file__))


def cmd_migrate(args: argparse.Namespace) -> int:
    """
    Exécute ``alembic upgrade head`` avec des tentatives tant que la base n'est pas joignable.
    L'option ``--noinput`` est acceptée pour la compatibilité avec les déploiements (comme Django).
    """
    _ = args.noinput  # non interactif : Alembic n'affiche pas de prompt en upgrade head
    max_attempts = 40
    delay_s = 2.0
    for attempt in range(1, max_attempts + 1):
        proc = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=_BACK_ROOT,
            check=False,
        )
        if proc.returncode == 0:
            return 0
        print(
            f"db-migrate: tentative {attempt}/{max_attempts}, attente PostgreSQL…",
            file=sys.stderr,
        )
        time.sleep(delay_s)
    return 1


def main() -> None:
    """Analyse la ligne de commande et exécute la sous-commande demandée."""
    parser = argparse.ArgumentParser(
        description="Outils de gestion M-Motors (migrations, …).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_migrate = sub.add_parser("migrate", help="Applique les migrations SQLAlchemy (Alembic).")
    p_migrate.add_argument(
        "--noinput",
        action="store_true",
        help="Compatibilité scripts / K8s (aucune saisie ; inchangé pour upgrade).",
    )
    p_migrate.set_defaults(func=cmd_migrate)

    ns = parser.parse_args()
    code = int(ns.func(ns))
    if code != 0:
        sys.exit(code)


if __name__ == "__main__":
    main()
