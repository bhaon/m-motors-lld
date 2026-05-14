# M-Motors - Studi Bloc 3

Application web de gestion M-Motors avec ajout du parcours **Location Longue Duree (LLD)**.

Le projet est compose de :
- un frontend `Next.js` (React, TypeScript),
- un backend `FastAPI` (Python),
- une stack Kubernetes `k8s` (base + overlays),
- une CI/CD GitHub Actions (tests, build, scan securite, deploiement).

## Sommaire

- [Architecture](#architecture)
- [Observabilite (OpenTelemetry)](#observabilite-opentelemetry)
- [Arborescence utile](#arborescence-utile)
- [Prerequis](#prerequis)
 
## Architecture
  
### Frontend
- Framework: `Next.js 15`
- Langage: `TypeScript`
- UI: `React`, `Tailwind`
- Rôle: interface utilisateur, appels API, pages publiques/privées
  
### Backend 
- Framework: `FastAPI`
- ORM/migrations: `SQLAlchemy`, `Alembic`
- Serveur: `Uvicorn/Gunicorn`
- Rôle: API REST, logique metier, acces PostgreSQL

### Infrastructure
- Orchestration: `Kubernetes` (manifests Kustomize)
- Ingress: `Traefik`
- Certificats: `cert-manager` (selon env)
- Registry images: `GHCR`

## Observabilite (OpenTelemetry)

Traces et logs (corrélation, export OTLP optionnel) sont décrits dans le guide **[docs/observabilite-opentelemetry.md](docs/observabilite-opentelemetry.md)** (fichiers touchés, variables d’environnement, usage `logging` / `getLogger`). Avec **docker compose**, l’UI **Jaeger** est disponible sur [http://localhost:16686](http://localhost:16686) pour visualiser les traces (`mmotors-api`, `mmotors-frontend`).

## Arborescence utile

```text
.
├── frontend/                 # Application Next.js
├── backend/                  # API FastAPI + migrations Alembic
├── k8s/
│   ├── base/                 # Ressources communes
│   ├── overlays/             # dev, staging, production
│   └── infra/                # infra cluster (traefik, quotas, rbac...)
├── .github/workflows/        # CI/CD GitHub Actions
└── README.md
```

## Prerequis

- `Node.js` >= 20 (24 utilise en CI)
- `npm`
- `Python` 3.12
- `pip`
- `Docker` (pour builds images)
- `kubectl` + acces cluster (pour deploiement)
- `kustomize` (ou `kubectl kustomize`)

Projet maintenu dans le cadre de l'examen Studi Bloc 3.
