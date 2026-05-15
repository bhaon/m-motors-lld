# M-Motors — Studi Bloc 3 (LLD)

Application web de gestion **M-Motors** avec parcours **Location Longue Durée (LLD)** : dossiers client, validation back-office, contrats et avenants, catalogue d’options LLD, livraison / clôture, reporting, notifications e-mail, audit, conformité (chiffrement des données personnelles au repos, RBAC, rétention).

Le projet est composé de :

- un frontend **Next.js** (React, TypeScript),
- un backend **FastAPI** (Python),
- une stack **Kubernetes** avec **Kustomize** (base + overlays + infra),
- une **CI/CD GitHub Actions** (tests, build, scans sécurité, déploiements, rollback),
- un environnement local **Docker Compose** (PostgreSQL, MinIO, Jaeger, API, UI).

## Sommaire

- [Architecture](#architecture)
- [Développement local](#développement-local)
- [Observabilité](#observabilité)
- [Documentation](#documentation)
- [Arborescence utile](#arborescence-utile)
- [Prérequis](#prérequis)
- [CI/CD](#cicd)

## Architecture

### Frontend

- Framework : **Next.js 15** (ex. `15.5.x` dans `package.json`)
- Langage : **TypeScript**
- UI : **React**, **Tailwind**
- Tests : **Jest**, **Playwright** (e2e)
- Rôle : interface utilisateur, appels API (y compris proxy `/api` vers le backend en dev), pages publiques / privées
- Télémétrie : **OpenTelemetry** (traces vers OTLP / Jaeger selon configuration)

### Backend

- Framework : **FastAPI**
- ORM / migrations : **SQLAlchemy**, **Alembic**
- Serveur : **Uvicorn** (dev) / **Gunicorn** (image prod)
- Rôle : API REST, logique métier LLD, accès **PostgreSQL**, stockage objets **S3-compatible** (MinIO en local, configurable en cluster)
- Observabilité : traces **OTLP**, exposition **Prometheus** sur `/metrics` (voir doc US-08-03)
- Données sensibles : utilitaires PII / chiffrement au repos, jobs (rappels brouillons, etc.)

### Infrastructure (Kubernetes)

- Orchestration : **Kubernetes**, manifests assemblés avec **Kustomize**
- **Ingress** : **Traefik** ; certificats : **cert-manager** (selon environnement)
- **Registry** des images : **GHCR**
- **Redis** : déployé avec l’application en cluster (cache / sessions selon configuration) — absent du `docker-compose` local minimal
- **Monitoring cluster** : manifests sous `k8s/infra/monitoring/` (Jaeger, Prometheus, Grafana, Loki, alertes) — [docs/monitoring/README.md](docs/monitoring/README.md)

## Développement local

Fichier principal : **`docker-compose.yml`**.

| Service    | Rôle                         | Accès typique                          |
|-----------|-------------------------------|----------------------------------------|
| `db`      | PostgreSQL 16                 | `localhost:5432` (utilisateur `mmotors`) |
| `minio`   | API S3 + console              | API `9000`, console `http://localhost:9001` |
| `jaeger`  | Collecte OTLP + UI traces     | `http://localhost:16686`               |
| `backend` | FastAPI + migrations au démarrage | `http://localhost:8000` (`/api/docs`) |
| `frontend`| Next.js (dev)                 | `http://localhost:3000`                |

Commandes courantes :

```bash
docker compose up -d          # démarrer la stack
docker compose logs -f        # suivre les logs
docker compose down           # arrêter (volumes conservés)
```

Le **`Makefile`** à la racine propose des raccourcis (`make help`) : `up`, `down`, `migrate`, `seed`, `test-backend`, `test-frontend`, shells dans les conteneurs, etc.

Surcharges locales non versionnées : créer un fichier **`docker-compose.override.yml`** (ignoré par Git).

## Observabilité

- **Métriques, logs, traces, alertes et exploitation** : [docs/monitoring/README.md](docs/monitoring/README.md) (OpenTelemetry, Jaeger, Prometheus, Grafana, Loki, dashboard US-08-03).
- **Déploiement Kubernetes** (hors monitoring) : [docs/k8s/README.md](docs/k8s/README.md).

## Documentation

- **Développement fonctionnel (user stories)** : [docs/development/README.md](docs/development/README.md) — fiches détaillées : [docs/development/](docs/development/)
- **Schéma base (DBML)** : [docs/schema.dbml](docs/schema.dbml) et variante [docs/Database/schéma.dbml](docs/Database/schéma.dbml)
- **Kubernetes** (Kustomize, K3s, TLS, secrets, MinIO, CI/CD) : [docs/k8s/README.md](docs/k8s/README.md)
- **Observabilité et logs** (OTEL, Jaeger, Prometheus, Grafana, Loki) : [docs/monitoring/README.md](docs/monitoring/README.md)
- **CI/CD GitHub Actions** (secrets, environments, déploiements) : [docs/cicd/README.md](docs/cicd/README.md)

## Arborescence utile

```text
.
├── frontend/                 # Application Next.js
├── backend/                  # API FastAPI, Alembic, scripts seed/admin
├── k8s/
│   ├── base/                 # Déploiements communs (frontend, backend, redis…)
│   ├── overlays/             # dev, staging, production
│   └── infra/                # namespaces, traefik, cert-manager, monitoring…
├── docs/
│   ├── monitoring/           # OpenTelemetry, US-08-03 observabilité
│   ├── development/          # User stories et guide de développement
│   ├── k8s/                  # Guides complémentaires K8s
│   └── Database/             # Schémas DBML
├── .github/workflows/        # CI réutilisable, déploiements, sécurité, Sonar, rollback
├── scripts/                  # Scripts utilitaires (ex. sealed-secrets)
├── prototypesHTML/           # Maquettes HTML
├── docker-compose.yml        # Stack de développement local
├── Makefile                  # Raccourcis docker compose / tests / migrations
├── sonar-project.properties  # Analyse SonarQube (PR)
└── README.md
```

## Prérequis

- **Node.js** : ≥ 20 pour un dev hors conteneur ; **Node 24** utilisé dans la CI ; l’image du service `frontend` dans Docker Compose est basée sur **Node 22**.
- **npm**
- **Python** 3.12
- **pip**
- **Docker** et **Docker Compose** (stack locale + builds d’images)
- **kubectl** + accès cluster (déploiement)
- **Kustomize** (ou `kubectl kustomize`) ; éventuellement **Helm** pour la stack monitoring — voir [docs/monitoring/README.md](docs/monitoring/README.md)

Projet maintenu dans le cadre de l’examen Studi Bloc 3.

## CI/CD

Guide complet (workflows, secrets, variables, environments GitHub, procédures de configuration) : **[docs/cicd/README.md](docs/cicd/README.md)**.

Résumé : **`ci.yaml`** (réutilisable) → **`deploy-dev`** / **`deploy-staging`** / **`deploy-production`** (Kustomize + GHCR) ; **`sonarqube-pr`** (SAST) ; **`security-scan`** (hebdo) ; **`rollback`** (manuel).
