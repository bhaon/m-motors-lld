# Documentation développeur — Backend M-Motors LLD

Guide de référence pour travailler sur l’API **FastAPI** du projet **M-Motors LLD** sans connaissance préalable du dépôt.  
Code source : répertoire `backend/` à la racine du monorepo.

---

## Sommaire

1. [Vue d’ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Démarrage rapide](#3-démarrage-rapide)
4. [Arborescence du projet](#4-arborescence-du-projet)
5. [Architecture applicative](#5-architecture-applicative)
6. [Configuration (variables d’environnement)](#6-configuration-variables-denvironnement)
7. [Base de données](#7-base-de-données)
8. [Authentification, sessions et RBAC](#8-authentification-sessions-et-rbac)
9. [API REST — organisation des routes](#9-api-rest--organisation-des-routes)
10. [Couche services (logique métier)](#10-couche-services-logique-métier)
11. [Emails transactionnels](#11-emails-transactionnels)
12. [Stockage objet (MinIO / S3)](#12-stockage-objet-minio--s3)
13. [Jobs planifiés (CLI)](#13-jobs-planifiés-cli)
14. [Observabilité](#14-observabilité)
15. [Tests](#15-tests)
16. [Style de code et qualité](#16-style-de-code-et-qualité)
17. [Guide : ajouter une fonctionnalité](#17-guide--ajouter-une-fonctionité)
18. [Dépannage fréquent](#18-dépannage-fréquent)
19. [Documentation complémentaire](#19-documentation-complémentaire)

---

## 1. Vue d’ensemble

Le backend expose une **API REST JSON** pour :

- le **parcours client** (inscription, dossiers LLD/achat, pièces jointes, contrats, signature) ;
- le **back-office** (gestionnaires, superviseurs, admins) ;
- le **catalogue véhicules** et **options LLD** ;
- le **reporting** et l’**administration** (utilisateurs, audit).

**Principes structurants :**

| Principe | Détail |
|----------|--------|
| Point d’entrée ASGI | `app.main:application` (variable `application`, pas `app`) |
| Préfixe API métier | `/api/v1/...` |
| Schéma BDD | **Alembic uniquement** en prod — pas de `create_all()` au démarrage de l’API |
| Logique métier | Prefer **services** réutilisables ; endpoints = orchestration HTTP |
| Données personnelles | Chiffrement **pgcrypto** au repos sur PostgreSQL (hors mode test SQLite) |
| Auth navigateur | Cookie **HttpOnly** `access_token` (JWT) pour le frontend Next.js |
| Auth outils / tests | Header **Bearer** JWT sur certains endpoints back-office |

**Ce qui n’est pas dans le backend :**

- **Redis** : non utilisé (malgré une mention commentée dans `.env.example`).
- Rendu HTML : le frontend Next.js consomme l’API ; seuls les emails et templates Markdown contrat sont générés côté serveur.

---

## 2. Stack technique

| Composant | Version (pin) | Rôle |
|-----------|---------------|------|
| **Python** | 3.12 | Runtime (Docker, CI) |
| **FastAPI** | 0.136.x | Framework HTTP, OpenAPI, validation |
| **Starlette** | 0.49.x | ASGI sous-jacent |
| **Uvicorn** | 0.30.x | Serveur dev (`--reload`) |
| **Gunicorn** | 22.x | Serveur prod (workers Uvicorn) |
| **SQLAlchemy** | 2.0.x | ORM (style 2.0 : `Mapped`, `mapped_column`) |
| **Alembic** | 1.13.x | Migrations |
| **PostgreSQL** | 16 | Base prod / CI / docker-compose |
| **psycopg2-binary** | 2.9.x | Driver synchrone |
| **Pydantic** | 2.9.x | Schémas API, settings |
| **pydantic-settings** | 2.6.x | `Settings` depuis l’environnement |
| **python-jose** | 3.5.x | JWT HS256 |
| **passlib + bcrypt** | 1.7.4 / **3.2.2** | Hash mots de passe (**bcrypt 4.x interdit**) |
| **httpx** | 0.27.x | Client HTTP (instrumenté OTel) |
| **Resend** | 2.30.x | Emails transactionnels |
| **boto3** | 1.35.x | MinIO / S3 (pièces, photos) |
| **OpenTelemetry** | 1.28.x | Traces OTLP + instrumentations |
| **prometheus-fastapi-instrumentator** | 7.x | Métriques HTTP `/metrics` |

**Outils dev** (`requirements-dev.txt`) : pytest, pytest-cov, ruff, mypy, bandit.

Fichiers de dépendances :

- `backend/requirements.txt` — runtime
- `backend/requirements-dev.txt` — inclut `-r requirements.txt` + outils test/lint

---

## 3. Démarrage rapide

### 3.1 Avec Docker (recommandé)

À la **racine du monorepo** :

```bash
make up          # db + minio + jaeger + backend + frontend
make migrate     # alembic upgrade head dans le conteneur backend
make seed        # véhicules de démo (optionnel)
make admin       # créer un compte administrateur interactif
```

URLs utiles :

| Service | URL |
|---------|-----|
| API + Swagger | http://localhost:8000/api/docs |
| OpenAPI JSON | http://localhost:8000/api/openapi.json |
| Health | http://localhost:8000/api/health |
| Métriques Prometheus | http://localhost:8000/metrics |
| MinIO console | http://localhost:9001 |

### 3.2 Sans Docker (local)

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env   # renseigner au minimum SECRET_KEY et DATABASE_URL
alembic upgrade head
uvicorn app.main:application --reload --host 0.0.0.0 --port 8000
```

PostgreSQL et MinIO doivent être accessibles aux URLs configurées dans `.env`.

### 3.3 Commandes Makefile (racine)

| Commande | Action |
|----------|--------|
| `make up` / `make down` | Démarrer / arrêter la stack |
| `make migrate` | Appliquer les migrations |
| `make migration name="description"` | Générer une révision Alembic (`alembic revision --autogenerate`) |
| `make test-backend` | `pytest tests/ -v` dans le conteneur backend |
| `make shell-backend` | Shell dans le conteneur API |
| `make seed` | `python scripts/seed.py` |
| `make admin` | `python scripts/create_admin.py` |

---

## 4. Arborescence du projet

```text
backend/
├── alembic/                    # Migrations versionnées
│   ├── env.py                  # URL DB + import de tous les modèles
│   └── versions/               # 001 … 016 (voir §7)
├── alembic.ini
├── app/
│   ├── main.py                 # Application FastAPI, CORS, lifespan, health
│   ├── telemetry.py            # OpenTelemetry (OTLP, instrumentations)
│   ├── prometheus_metrics.py   # Endpoint /metrics
│   ├── api/v1/
│   │   ├── router.py           # Agrège tous les routers sous /api/v1
│   │   ├── openapi_responses.py
│   │   └── endpoints/          # Un fichier par domaine HTTP
│   │       ├── auth.py
│   │       ├── dossiers.py       # Fichier le plus volumineux (~1600 lignes)
│   │       ├── vehicles.py
│   │       ├── reporting.py
│   │       ├── admin.py
│   │       ├── lld_catalog_public.py
│   │       └── lld_catalog_bo.py
│   ├── core/
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   ├── security.py         # JWT, hash mot de passe
│   │   └── deps.py             # Dépendances FastAPI (DB, auth, RBAC)
│   ├── db/
│   │   ├── session.py          # Engine, SessionLocal, get_db
│   │   └── types.py            # Types SQLAlchemy chiffrés (pgcrypto)
│   ├── models/                 # Tables ORM
│   ├── schemas/                # Modèles Pydantic entrée/sortie API
│   ├── services/               # Logique métier
│   ├── jobs/                   # Entrées CLI cron
│   ├── utils/                  # Helpers (ex. hash email PII)
│   └── templates/              # Markdown contrats / avenants
├── scripts/
│   ├── seed.py
│   └── create_admin.py
├── tests/
│   ├── conftest.py             # Fixtures globales (SQLite)
│   ├── unit/
│   └── integration/
├── manage.py                   # migrate (retry Postgres, K8s initContainer)
├── requirements.txt
├── requirements-dev.txt
├── ruff.toml
├── Dockerfile
├── docker-entrypoint.sh        # Prod : gunicorn
├── docker-entrypoint.dev.sh    # Dev : migrate + uvicorn --reload
└── gunicorn_conf.py
```

### Rôle de chaque package `app/`

| Dossier | Responsabilité | Ne pas y mettre |
|---------|----------------|-----------------|
| `api/v1/endpoints/` | Routes, status HTTP, appels services, `commit` | Règles métier longues dupliquées |
| `schemas/` | Validation entrée, forme JSON sortie | Accès direct SQL |
| `models/` | Tables, relations, enums SQLAlchemy | Logique HTTP |
| `services/` | Règles métier, envoi email, S3, calculs | Dépendance à `Request` FastAPI |
| `core/` | Config transverse, sécurité, DI | Code métier dossier/véhicule |
| `jobs/` | `python -m app.jobs.*` pour tâches planifiées | Routes HTTP |

---

## 5. Architecture applicative

### 5.1 Flux d’une requête HTTP

```text
Client (navigateur / TestClient)
    → FastAPI (main.py) : CORS, OTel, Prometheus
    → Router /api/v1/... (router.py)
    → Endpoint (endpoints/*.py)
        → deps : get_db, get_user_from_cookie / Bearer
        → enforce_role (si BO)
        → service.* (logique)
        → db.commit() / refresh
    → Schéma Pydantic (response_model)
    → JSON
```

### 5.2 Séparation Modèle / Schéma / Service

| Couche | Technologie | Exemple |
|--------|-------------|---------|
| **Model** | SQLAlchemy `Mapped` | `app/models/dossier.py` → `Dossier` |
| **Schema** | Pydantic v2 | `app/schemas/dossier.py` → `DossierDetailOut` |
| **Service** | Fonctions Python + `Session` | `app/services/lld_dossier_lifecycle.py` |

Les schémas de sortie utilisent souvent :

```python
model_config = ConfigDict(from_attributes=True)
```

pour sérialiser une instance ORM.

### 5.3 Injection de dépendances (`app/core/deps.py`)

Types alias courants :

```python
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]  # Bearer JWT
```

Fonctions importantes :

| Fonction / type | Usage |
|-----------------|--------|
| `get_db()` | Session SQLAlchemy par requête (yield + close) |
| `get_current_user` | JWT dans header `Authorization: Bearer` |
| `get_user_from_cookie` | JWT dans cookie `access_token` |
| `enforce_role(user, RoleEnum.superviseur, ...)` | Lève **403** si rôle incorrect |
| `GestionnaireMultiAuth` | Bearer **ou** cookie (certains BO) |
| `require_admin`, `require_superviseur` | Raccourcis Bearer |

### 5.4 Gestion des erreurs

Pas de handler d’exception global personnalisé : on lève **`HTTPException`** avec un `detail` (string ou message métier).

Exemples de constantes locales dans les endpoints : `GENERIC_LOGIN_ERROR`, messages 404 véhicule.

Documentation OpenAPI enrichie : `app/api/v1/openapi_responses.py` (`openapi_http_error`) — utilisé notamment sur `vehicles.py`.

### 5.5 Transactions et audit

Pattern fréquent :

1. Modifier les modèles ORM
2. `audit_service.record(db, action=..., before_state=..., after_state=...)`
3. `db.commit()`
4. `db.refresh(entity)` si besoin pour la réponse

L’audit est **append-only** (`app/models/audit.py`, `app/services/audit.py`).

---

## 6. Configuration (variables d’environnement)

Classe centrale : `app/core/config.py` → `settings = Settings()`.

Chargement : variables d’environnement + fichier `.env` optionnel (`case_sensitive=True`, `extra="ignore"`).

### Variables obligatoires / critiques

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SECRET_KEY` | **Oui** | Signature JWT (min. 32 caractères en prod) |
| `DATABASE_URL` | **Oui*** | URL SQLAlchemy `postgresql://...` |
| `POSTGRES_*` | Alternative | Si `DATABASE_URL` absent, construite depuis host/user/password/db |

\* En tests unitaires : `sqlite:///./pytest_unit.db` (voir `tests/conftest.py`).

### Variables métier courantes

| Variable | Défaut | Description |
|----------|--------|-------------|
| `FRONTEND_BASE_URL` | URL prod | Liens dans les emails |
| `RESEND_API_KEY` | — | Sans clé : emails loggés / non envoyés |
| `RESEND_FROM_EMAIL` | — | Expéditeur Resend |
| `PII_ENCRYPTION_KEY` | `SECRET_KEY` | Clé pgcrypto champs PII |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 1440 | Durée JWT |
| `DRAFT_REMINDER_AFTER_DAYS` | 30 | Job rappel brouillon |
| `ALLOWED_ORIGINS` | localhost HTTPS | CORS (CSV ou JSON array) |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`, … | MinIO local | Stockage pièces / photos |

### OpenTelemetry (hors Settings)

| Variable | Rôle |
|----------|------|
| `OTEL_SDK_DISABLED=true` | Désactive OTel (tests) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collecteur OTLP (ex. Jaeger) |
| `OTEL_SERVICE_NAME` | Nom du service dans les traces |
| `OTEL_LOGS_EXPORTER=none` | Évite conflit avec logging Python |

Référence complète : `backend/.env.example`.

---

## 7. Base de données

### 7.1 Connexion (`app/db/session.py`)

- Engine avec `pool_pre_ping=True`, `pool_size=10`, `max_overflow=20`
- `SessionLocal = sessionmaker(autocommit=False, autoflush=False)`
- **`get_db()`** : générateur FastAPI standard

**Important :** le lifespan de `main.py` **n’exécute pas** `Base.metadata.create_all()`. Le schéma doit être à jour via **Alembic**.

### 7.2 Modèles principaux

| Fichier | Entités |
|---------|---------|
| `models/user.py` | `User`, `RoleEnum` |
| `models/vehicle.py` | `Vehicle`, `VehiclePhoto`, `VehicleOption`, `MoteurEnum` |
| `models/dossier.py` | `Dossier`, `PieceJustificative`, `DossierHistorique`, statuts |
| `models/dossier_contract.py` | `DossierContrat` (markdown, signature) |
| `models/option_lld.py` | Options cochées par dossier |
| `models/lld_avenant.py` | Avenants sous contrat |
| `models/lld_option_catalog.py` | Catalogue options + historique prix |
| `models/audit.py` | `AuditTrail` |
| `models/feature_flag.py` | Feature flags |

### 7.3 Cycle de vie d’un dossier (`DossierStatusEnum`)

```text
brouillon → depose → en_instruction → valide → en_signature
    → attente_livraison / livraison_planifiee → contrat_en_cours → cloture
    (+ rejete, annule)
```

Types : `lld` | `achat` (`DossierTypeEnum`).

Champs contrat LLD notables sur `Dossier` :

- `date_debut_contrat`, `duree_mois` (souvent 36 après livraison)
- `draft_reminder_sent_at`, `retention_alert_sent_at` (jobs email)
- `livraison_prevue_at` (US-06-10)

La **date de fin** n’est en général **pas stockée** : calculée `date_debut + duree_mois` (mois civils) — voir `lld_dossier_lifecycle._add_months`.

### 7.4 Migrations Alembic

| Commande | Contexte |
|----------|----------|
| `alembic upgrade head` | Appliquer toutes les migrations |
| `alembic revision --autogenerate -m "..."` | Générer après changement modèles |
| `python manage.py migrate` | K8s initContainer (retry connexion Postgres) |

Convention de nommage : `NNN_us_XX_yy_description.py` (ex. `016_us_06_11_retention_alert.py`).

Révisions actuelles (ordre) :

`001_initial_schema` → … → `015_us_11_01_pii_encryption_at_rest` → `016_us_06_11_retention_alert`.

`alembic/env.py` importe **tous** les modèles pour que l’autogenerate détecte les changements.

### 7.5 Chiffrement PII (US-11-01)

- Champs utilisateur sensibles : `email`, `first_name`, `last_name`, `birth_date`
- Types : `PgcryptoEncryptedText`, `PgcryptoEncryptedDate` (`app/db/types.py`)
- Recherche login : colonne `email_hash` (SHA-256 email normalisé, `app/utils/client_pii.py`)
- **Actif** si PostgreSQL **et** `ENV` / `ENVIRONMENT` ≠ `test`
- Tests unitaires : SQLite en clair (pas de pgcrypto)

Tokens email / reset : **jamais** stockés en clair — hash SHA-256 en base.

---

## 8. Authentification, sessions et RBAC

### 8.1 JWT (`app/core/security.py`)

- Algorithme **HS256**, secret `settings.SECRET_KEY`
- Payload : `sub` (email), `role`, `exp`
- Durée : `ACCESS_TOKEN_EXPIRE_MINUTES`

### 8.2 Inscription client (`POST /api/v1/auth/register`)

- Rôle forcé **`client`**
- CGU / politique de confidentialité horodatées
- Email de confirmation (token hashé en base, expiration 24h)
- Compte inactif tant que `email_verified=False`

### 8.3 Connexion (`POST /api/v1/auth/login`)

- Recherche par `email_hash`
- Vérifications : mot de passe, email vérifié, compte actif
- Réponse + cookie **`access_token`** : `HttpOnly`, `SameSite=Lax`, `Secure` si frontend en HTTPS

### 8.4 Autres routes auth utiles

| Route | Rôle |
|-------|------|
| `GET /auth/me` | Profil courant |
| `POST /auth/logout` | Efface le cookie |
| `POST /auth/forgot-password` / `reset-password` | Réinitialisation MDP |
| `GET /auth/confirm-email` | Activation compte (lien email) |
| `GET /auth/confirm-contract-signature` | Signature contrat LLD |
| `GET /auth/confirm-avenant-signature` | Signature avenant |
| `POST /auth/request-data-erasure` | Demande effacement RGPD (client) |

### 8.5 Rôles (`RoleEnum`)

| Rôle | Périmètre typique |
|------|-------------------|
| `client` | Ses dossiers, contrats, profil |
| `gestionnaire` | Back-office dossiers, véhicules, catalogue LLD BO |
| `superviseur` | + reporting, dashboard contrats en cours |
| `admin` | + gestion utilisateurs, audit trail |

**Matrice à respecter** lors d’un nouvel endpoint :

- Tester **403** pour les rôles non autorisés (`tests/unit/test_rbac.py`).
- Le claim JWT `role` est **recroisé** avec le rôle en base dans `get_user_from_cookie`.

### 8.6 Deux modes d’auth côté API

| Mode | Mécanisme | Utilisé par |
|------|-----------|-------------|
| **Cookie** | `access_token` HttpOnly | Frontend Next.js (`credentials: "include"`) |
| **Bearer** | Header `Authorization` | Tests, scripts, certains endpoints BO (`GestionnaireUser`) |

En tests d’intégration, le pattern courant :

```python
login = client.post("/api/v1/auth/login", json={"email": "...", "password": "..."})
token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
headers = {"Cookie": f"access_token={token}"}
```

---

## 9. API REST — organisation des routes

Agrégation : `app/api/v1/router.py` → préfixe **`/api/v1`**.

### 9.1 Table des routers

| Module | Préfixe route | Tag OpenAPI |
|--------|---------------|-------------|
| `auth.py` | `/auth` | Authentification |
| `dossiers.py` | `/dossiers` | Dossiers |
| `vehicles.py` | `/vehicules` | Véhicules (**orthographe française**) |
| `reporting.py` | `/reporting` | Reporting |
| `admin.py` | `/admin` | Administration |
| `lld_catalog_public.py` | `/lld-catalog` | Catalogue LLD (public) |
| `lld_catalog_bo.py` | `/backoffice/lld-catalog` | Catalogue LLD (BO) |

### 9.2 Routes hors `/api/v1`

| Route | Rôle |
|-------|------|
| `GET /api/health`, `/api/healthz`, `/api/readyz` | Sonde santé (readyz vérifie la DB) |
| `GET /api/docs`, `/api/redoc`, `/api/openapi.json` | Documentation |
| `GET /metrics` | Prometheus |

### 9.3 Dossiers — carte des endpoints (extrait)

**Client (cookie)** :

- `POST /dossiers` — créer brouillon
- `GET /dossiers/me` — liste
- `GET /dossiers/{id}` — détail
- `POST /dossiers/{id}/submit` — dépôt
- `POST /dossiers/{id}/pieces/upload-init` + `upload-complete` — S3
- `GET /dossiers/contrats` — historique LLD (US-04-04)
- `GET /dossiers/{id}/contrat` — markdown contrat
- `PATCH /dossiers/{id}/options-lld` — options / avenant

**Back-office (cookie + rôles staff)** :

- `GET /dossiers/backoffice` — liste paginée (US-06-01)
- `PATCH /dossiers/backoffice/{id}/prendre-en-charge` — US-06-02
- `PATCH .../valider`, `.../rejeter` — US-06-04/05
- `POST .../planifier-livraison`, `.../effectuer-livraison` — US-06-09/10

### 9.4 Reporting (superviseur + admin)

- `GET /reporting/summary`
- `GET /reporting/dossiers?period=week|month|quarter`
- `GET /reporting/dossiers/export.csv`
- `GET /reporting/contrats-en-cours` — US-06-11

### 9.5 Admin (admin)

- CRUD utilisateurs staff, changement de rôle
- `GET /admin/audit-trail`

Les user stories détaillées sont dans `docs/UserStories/US-*.md`.

---

## 10. Couche services (logique métier)

| Service | Fichier | Responsabilité |
|---------|---------|----------------|
| Cycle de vie LLD | `lld_dossier_lifecycle.py` | Fin de contrat → clôture, phases location, J-90 |
| Options LLD | `lld_options_catalog.py` | Catalogue coché, totaux mensuels |
| Avenants | `lld_avenant_flow.py`, `avenant_fill.py` | Flux signature avenant |
| Contrat markdown | `contract_fill.py` | Remplissage template contrat |
| Dashboard contrats | `active_contracts_dashboard.py` | Liste contrats en cours (US-06-11) |
| Alertes rétention | `contract_retention_alerts.py` | Email fin contrat |
| Rappels brouillon | `draft_reminders.py` | Email dossier non soumis |
| Emails | `emailing.py` | Tous les envois Resend |
| Object storage | `object_storage.py` | URLs présignées S3/MinIO |
| Audit | `audit.py` | Constantes actions + `record()` |
| Catalogue données | `lld_catalog_data.py` | Lecture/écriture catalogue |
| Rétention RGPD | `data_retention.py` | Purge comptes |

**Convention :** une fonction de service prend souvent `db: Session` en premier argument, retourne des données ou modifie les entités ; l’endpoint fait le `commit`.

**Tests unitaires** ciblent de préférence les services (rapides, SQLite) plutôt que toute la pile HTTP.

---

## 11. Emails transactionnels

Implémentation : `app/services/emailing.py` (API **Resend**).

| Fonction | Déclencheur |
|----------|-------------|
| `send_verification_email` | Inscription |
| `send_password_reset_email` | Mot de passe oublié |
| `send_draft_reminder_email` | Job brouillon (US-03-05) |
| `send_dossier_submission_email` | Dépôt dossier |
| `send_status_change_email` | Changement statut |
| `send_contract_ready_email` / `send_contract_signature_link_email` | Contrat LLD |
| `send_avenant_signature_link_email` | Avenant |
| `send_livraison_planifiee_email` | Livraison planifiée |
| `send_contract_retention_alert_email` | Fin contrat J-90 (US-06-11) |

Comportement sans `RESEND_API_KEY` : warning log, pas d’envoi (les tests mockent souvent Resend).

HTML : templates inline dans les fonctions `_build_*_email_html`.

---

## 12. Stockage objet (MinIO / S3)

Service : `app/services/object_storage.py` (boto3).

Deux usages :

| Bucket (config) | Contenu |
|-----------------|---------|
| Documents dossier | Pièces justificatives (URLs présignées **privées**) |
| Photos véhicules | Images catalogue (URLs **publiques** longue durée) |

Flux pièce jointe :

1. `POST .../pieces/upload-init` → URL PUT présignée + clé S3
2. Client upload direct vers MinIO
3. `POST .../pieces/upload-complete` → enregistrement en base + checksum

---

## 13. Jobs planifiés (CLI)

Pas de Celery : jobs **synchrones** invoqués par cron / CronJob K8s.

| Module | Commande | User story |
|--------|----------|------------|
| `app/jobs/remind_stale_draft_dossiers.py` | `python -m app.jobs.remind_stale_draft_dossiers` | US-03-05 |
| `app/jobs/notify_contracts_ending_soon.py` | `python -m app.jobs.notify_contracts_ending_soon` | US-06-11 |

Pattern :

```python
db = SessionLocal()
try:
    n = process_*(db, now=datetime.now(timezone.utc))
finally:
    db.close()
```

Idempotence : colonnes `*_sent_at` sur `Dossier` pour ne pas renvoyer les emails.

---

## 14. Observabilité

### 14.1 OpenTelemetry (`app/telemetry.py`)

- Instrumentation : FastAPI, SQLAlchemy, logging, httpx
- Export OTLP HTTP vers collecteur (Jaeger en dev docker-compose)
- Désactivé si `OTEL_SDK_DISABLED=true` (tests)

### 14.2 Prometheus (`app/prometheus_metrics.py`)

- Endpoint **`GET /metrics`**
- Désactivable : `PROMETHEUS_METRICS_ENABLED=false`

### 14.3 Logs

- Niveau via `LOG_LEVEL`
- Les jobs configurent `logging.basicConfig` en CLI

Doc exploitation : `docs/monitoring/`.

---

## 15. Tests

### 15.1 Structure

| Répertoire | Base de données | Cible |
|------------|-----------------|-------|
| `tests/unit/` | SQLite fichier `pytest_unit.db` | Services, RBAC, règles métier, mocks email |
| `tests/integration/` | PostgreSQL (CI) | API bout-en-bout |

### 15.2 Fixtures globales (`tests/conftest.py`)

- `reset_db` **autouse** : `drop_all` / `create_all` entre chaque test
- `client` : `TestClient(application)`
- `db` : session SQLAlchemy directe
- Helpers : `create_user()`, `create_vehicle()`, `unique_email()`, `auth_header()`

Variables forcées en tête de conftest :

```python
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-minimum-32bytes!")
os.environ.setdefault("DATABASE_URL", "sqlite:///./pytest_unit.db")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
```

### 15.3 Intégration (`tests/integration/conftest.py`)

- `create_staff_user()`, `staff_cookie()`, `register_and_login()`

### 15.4 Nommage des fichiers de test

Aligné sur les user stories : `test_us_06_11_contrats_en_cours.py`, `test_reporting_dossiers_us06.py`, etc.

### 15.5 Exécution

```bash
# Dans Docker (recommandé)
make test-backend

# Local — tous les tests (CI, PostgreSQL requis pour intégration)
cd backend && pytest --cov=. --tb=short -q

# Unitaires seuls
pytest tests/unit/ -v

# Un fichier
pytest tests/unit/test_us_06_11_contrats_en_cours.py -q
```

CI (`.github/workflows/ci.yaml`) : service Postgres, `ENVIRONMENT=test`, couverture XML.

### 15.6 Bonnes pratiques tests

- Préférer des **dates fixes** pour les contrats LLD (`date_debut` + `duree_mois` en mois civils, pas `timedelta(days=900)`).
- Mocker `send_*_email` pour les jobs.
- Vérifier **403** gestionnaire sur routes superviseur.

---

## 16. Style de code et qualité

### 16.1 Ruff (`ruff.toml`)

- Python **3.12**, ligne **120** caractères
- `E712` ignoré (comparaisons `Model.field == True` SQLAlchemy)
- Guillemets doubles (formatter)

```bash
cd backend && ruff check .
ruff format .
```

### 16.2 Mypy

```bash
mypy . --ignore-missing-imports
```

Exécuté en CI ; `continue-on-error` possible en environnement `dev`.

### 16.3 Conventions observées

| Sujet | Convention |
|-------|------------|
| Imports | `from __future__ import annotations` en tête des modules |
| Docstrings | **Français**, une ligne sur fonctions publiques / services |
| Typage | `Mapped`, `Annotated`, types Pydantic v2 |
| Commentaires | Références US (`# US-06-10`) conservées |
| Commits | Messages en français, impératif (« Ajoute », « Corrige ») |

### 16.4 Bandit

Analyse sécurité statique (CI / local) : `bandit -r app/`.

---

## 17. Guide : ajouter une fonctionnalité

Checklist pour une nouvelle user story backend :

1. **Modèle** — Modifier ou créer dans `app/models/`, enums si besoin.
2. **Migration** — `make migration name="us_xx_yy_description"` puis relire le script généré.
3. **Schémas** — `app/schemas/` : `*In` (body), `*Out` (réponse).
4. **Service** — Logique testable dans `app/services/`.
5. **Endpoint** — Route dans le bon fichier `endpoints/`, `response_model`, RBAC via `enforce_role` ou deps.
6. **Audit** — Si action sensible : `audit_service.record(...)`.
7. **Email** — Si notification : fonction dans `emailing.py` + éventuel job dans `app/jobs/`.
8. **Tests** — `tests/unit/test_us_XX_....py` + intégration si flux HTTP complet.
9. **Doc** — `docs/UserStories/US-XX-....md`.

Exemple minimal d’endpoint superviseur :

```python
@router.get("/ma-ressource", response_model=MonSchemaOut)
def get_ma_ressource(
    db: DbSession,
    access_token: str | None = Cookie(default=None),
) -> MonSchemaOut:
    user = get_user_from_cookie(access_token, db)
    enforce_role(user, RoleEnum.superviseur, RoleEnum.admin)
    return mon_service.build(db)
```

Enregistrer le router dans `router.py` si nouveau module.

---

## 18. Dépannage fréquent

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| 401 sur routes client | Cookie absent / JWT expiré | Se reconnecter ; vérifier `credentials: "include"` côté front |
| 403 « rôle » | Mauvais rôle ou claim JWT ≠ base | Vérifier `User.role` en base |
| Erreur bcrypt au login | bcrypt 4.x installé | Garder `bcrypt==3.2.2` |
| Tables manquantes | Migrations non appliquées | `make migrate` |
| Emails non reçus | Pas de `RESEND_API_KEY` | Configurer Resend ; lire les logs backend |
| PII illisible en local SQLite | Normal en test | Tester chiffrement sur PostgreSQL |
| `fin_contrat_dans_3_mois` faux en test | Calcul en **mois civils** | Utiliser `date_debut` + `duree_mois`, pas seulement `timedelta` jours |
| Intégration skip en local | Pas de Postgres | Lancer `docker compose up db` ou CI |

---

## 19. Documentation complémentaire

| Document | Contenu |
|----------|---------|
| `docs/UserStories/` | Spécifications fonctionnelles par US |
| `docs/Database/schéma.dbml` | Schéma relationnel |
| `docs/monitoring/` | Prometheus, Grafana, Jaeger, Loki |
| `docs/k8s/` | Déploiement production |
| `docs/k8s/README.md` | Déploiement Kubernetes |
| `docs/monitoring/README.md` | Observabilité, métriques, logs, traces |
| `backend/.env.example` | Liste des variables d’environnement |

---

*Dernière mise à jour : alignée sur la structure du dépôt (migrations jusqu’à `016_us_06_11`, FastAPI 0.136, Python 3.12).*
