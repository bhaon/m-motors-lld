#!/bin/sh
# Démarre Gunicorn (workers Uvicorn) en HTTP (Kubernetes : TLS terminé à l'Ingress).
# runuser n'est utilisable qu'en root ; en pod Kubernetes (runAsNonRoot), on exécute directement.
set -e
if [ "$(id -u)" -eq 0 ]; then
  exec runuser -u fastapi -- /usr/local/bin/gunicorn \
    -c /app/gunicorn_conf.py \
    app.main:application
else
  exec /usr/local/bin/gunicorn \
    -c /app/gunicorn_conf.py \
    app.main:application
fi
