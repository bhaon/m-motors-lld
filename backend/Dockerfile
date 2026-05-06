# ──────────────────────────────────────────────
#  M-Motors — FastAPI Backend
#  Build : docker build -t mmotors-api .
#  TLS : terminé à l'Ingress en Kubernetes (HTTP en pod).
# ──────────────────────────────────────────────

FROM python:3.12-slim

WORKDIR /app

# System deps (psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY . .

# Groupe homonyme requis pour exécuter uvicorn sans root.
RUN groupadd --system --gid 1001 fastapi \
 && useradd --system --uid 1001 --gid fastapi --no-create-home --shell /usr/sbin/nologin fastapi

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/healthz')"

ENTRYPOINT ["/docker-entrypoint.sh"]
