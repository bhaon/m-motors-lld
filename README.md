# M-Motors - Studi Bloc 3

Application web de gestion M-Motors avec ajout du parcours **Location Longue Duree (LLD)**.

Le projet est compose de :
- un frontend `Next.js` (React, TypeScript),
- un backend `FastAPI` (Python),
- une stack Kubernetes `k8s` (base + overlays),
- une CI/CD GitHub Actions (tests, build, scan securite, deploiement).

## Sommaire

- [Architecture](#architecture)
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
