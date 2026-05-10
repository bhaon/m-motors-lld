#!/bin/sh
# Entrypoint dev — migrations Alembic puis uvicorn avec hot-reload.
# Utilisé par docker-compose.yml uniquement (ne jamais déployer en prod).
set -e

echo "[dev] Migrations Alembic..."
alembic upgrade head

echo "[dev] Démarrage uvicorn (hot-reload activé)..."
exec uvicorn app.main:application \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --log-level info
