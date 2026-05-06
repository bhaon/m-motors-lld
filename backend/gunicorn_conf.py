"""
Configuration Gunicorn pour exécuter FastAPI dans Kubernetes.

- Workers Uvicorn (ASGI) pour FastAPI
- Logs sur stdout/stderr (collectés par Kubernetes)
- Paramétrable via variables d'environnement
"""

from __future__ import annotations

import os


def _env_int(name: str, default: int) -> int:
    """Lit un entier depuis l'environnement avec valeur par défaut sûre."""
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


bind = f"0.0.0.0:{_env_int('PORT', 8000)}"
worker_class = "uvicorn.workers.UvicornWorker"
workers = _env_int("WEB_CONCURRENCY", 2)
threads = _env_int("GUNICORN_THREADS", 1)
timeout = _env_int("GUNICORN_TIMEOUT", 60)
graceful_timeout = _env_int("GUNICORN_GRACEFUL_TIMEOUT", 30)
keepalive = _env_int("GUNICORN_KEEPALIVE", 5)

# Logs
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")

# Kubernetes gère le scaling horizontal ; pas besoin de preload agressif ici.
preload_app = False
