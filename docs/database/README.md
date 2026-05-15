# Documentation développeur — Base de données M-Motors LLD

Guide de référence pour comprendre le **schéma PostgreSQL**, les **modèles SQLAlchemy** et le cycle **Alembic** du projet M-Motors LLD, sans connaissance préalable du dépôt.

**Fichiers associés :**

| Fichier | Rôle |
|---------|------|
| [`schéma.dbml`](schéma.dbml) | Schéma relationnel (DBML) — visualisation [dbdiagram.io](https://dbdiagram.io) |
| [`../schema.dbml`](../schema.dbml) | Copie / variante (vérifier la version la plus à jour) |
| `backend/app/models/` | **Source de vérité** ORM Python |
| `backend/alembic/versions/` | Migrations versionnées |
| [`../backend/README.md`](../backend/README.md) | Couche API qui consomme la base |

---

## Sommaire

1. [Vue d’ensemble](#1-vue-densemble)
2. [Stack et moteur](#2-stack-et-moteur)
3. [Principes de conception](#3-principes-de-conception)
4. [Modèle relationnel (tables)](#4-modèle-relationnel-tables)
5. [Enums métier](#5-enums-métier)
6. [Relations et intégrité](#6-relations-et-intégrité)
7. [Données personnelles (PII) et chiffrement](#7-données-personnelles-pii-et-chiffrement)
8. [Alembic — architecture](#8-alembic--architecture)
9. [Chaîne des migrations](#9-chaîne-des-migrations)
10. [Workflow développeur](#10-workflow-développeur)
11. [Environnements (PostgreSQL vs SQLite)](#11-environnements-postgresql-vs-sqlite)
12. [Requêtes, performances et bonnes pratiques](#12-requêtes-performances-et-bonnes-pratiques)
13. [Sauvegarde, seed et exploitation](#13-sauvegarde-seed-et-exploitation)
14. [Guide : faire évoluer le schéma](#14-guide--faire-évoluer-le-schéma)
15. [Dépannage fréquent](#15-dépannage-fréquent)
16. [Documentation complémentaire](#16-documentation-complémentaire)

---

## 1. Vue d’ensemble

La persistance repose sur **PostgreSQL 16** en développement, CI et production. L’application **ne crée pas** les tables au démarrage : le schéma est appliqué par **Alembic** (`alembic upgrade head`).

```text
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Modèles SQLAlchemy │ ──► │  Migrations Alembic  │ ──► │  PostgreSQL 16  │
│  app/models/*.py    │     │  alembic/versions/   │     │  (mmotors)      │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
         ▲                            │
         │                            │ autogenerate (indicatif)
         └────────────────────────────┘
```

**Règles d’or :**

1. Modifier d’abord les **modèles** Python, puis générer ou écrire une **migration**.
2. Ne jamais compter sur `Base.metadata.create_all()` en production (réservé aux tests SQLite).
3. Toute colonne ajoutée en prod doit avoir une révision Alembic **réversible** ou documentée comme irréversible.
4. Le fichier **DBML** est une aide visuelle : en cas de divergence, les **modèles + migrations** font foi.

---

## 2. Stack et moteur

| Composant | Détail |
|-----------|--------|
| **SGBD** | PostgreSQL **16** (`docker-compose` service `db`) |
| **Driver** | `psycopg2-binary` (SQLAlchemy synchrone) |
| **ORM** | SQLAlchemy **2.0** — style `Mapped`, `mapped_column`, `DeclarativeBase` |
| **Migrations** | Alembic **1.13** |
| **URL** | `DATABASE_URL` ou `POSTGRES_*` → `settings.database_url` |
| **Pool** | `pool_size=10`, `max_overflow=20`, `pool_pre_ping=True` (`app/db/session.py`) |
| **Extensions** | `pgcrypto` (chiffrement PII — migration `015`) |

Connexion type (docker-compose) :

```text
postgresql://mmotors:mmotors@db:5432/mmotors
```

---

## 3. Principes de conception

### 3.1 Source de vérité

| Couche | Emplacement | Rôle |
|--------|-------------|------|
| **ORM** | `backend/app/models/` | Définition tables, colonnes, relations, enums |
| **Migration** | `backend/alembic/versions/` | DDL appliqué sur PostgreSQL |
| **DBML** | `docs/database/schéma.dbml` | Documentation / diagramme ER |
| **API** | `backend/app/schemas/` | Contrats JSON (pas le schéma SQL) |

### 3.2 Identifiants et références métier

- **Clés primaires** : entiers auto-incrémentés (`id`).
- **Dossiers** : `reference` unique lisible (ex. `DOS-2026-…`) — index unique.
- **Contrats / avenants** : `reference` dédiée + lien `dossier_id`.

### 3.3 Horodatage

Presque toutes les tables portent `created_at` / `updated_at` (`timestamptz`, défaut `now()`).  
Événements métier supplémentaires : `submitted_at`, `validated_at`, `signed_at`, etc.

### 3.4 Soft delete et audit

- **Utilisateurs** : `deleted_at` (RGPD) — unicité email via `email_hash` **partielle** (`WHERE deleted_at IS NULL`).
- **Audit applicatif** : table `audit_trail` (append-only, JSON `before_state` / `after_state`).
- **Historique dossier** : `dossier_historique` (changements de statut).

### 3.5 Fichiers binaires

Les pièces jointes et photos ne sont **pas** en base : table avec `s3_key`, `checksum` SHA-256 ; contenu dans **MinIO/S3**.

---

## 4. Modèle relationnel (tables)

### 4.1 Vue d’ensemble (14 tables)

| Table | Modèle Python | Description |
|-------|---------------|-------------|
| `users` | `User` | Clients et staff (rôles) |
| `vehicles` | `Vehicle` | Parc véhicules catalogue |
| `vehicle_options` | `VehicleOption` | Options liées à un véhicule (legacy) |
| `vehicle_photos` | `VehiclePhoto` | Galerie photos véhicule |
| `dossiers` | `Dossier` | Dossier achat ou LLD |
| `pieces_justificatives` | `PieceJustificative` | Métadonnées pièces S3 |
| `dossier_historique` | `DossierHistorique` | Journal des statuts |
| `dossier_contrats` | `DossierContrat` | Contrat Markdown + signature |
| `options_lld` | `OptionLld` | Options cochées par dossier |
| `lld_option_catalog` | `LldOptionCatalog` | Référentiel options LLD |
| `lld_option_price_history` | `LldOptionPriceHistory` | Historique tarifs |
| `lld_avenants` | `LldAvenant` | Avenants sous contrat en cours |
| `audit_trail` | `AuditTrail` | Piste d’audit technique |
| `feature_flags` | `FeatureFlag` | Interrupteurs métier (options LLD) |

### 4.2 Table `users`

| Colonne | Type logique | Notes |
|---------|--------------|-------|
| `email`, `first_name`, `last_name`, `birth_date` | PII chiffré (pgcrypto) | Lecture via ORM transparente |
| `email_hash` | SHA-256 email normalisé | Login, unicité comptes actifs |
| `hashed_password` | bcrypt (passlib) | Jamais en clair |
| `role` | `role_enum` | `client`, `gestionnaire`, `superviseur`, `admin` |
| `email_verified`, `is_active` | bool | Activation compte |
| `deleted_at` | timestamptz nullable | Soft delete RGPD |
| Tokens | hash ou valeur unique | Vérification email, reset MDP — **pas** le jeton brut en clair pour signature contrat |

### 4.3 Table `dossiers` (cœur métier)

| Colonne | Notes |
|---------|-------|
| `type` | `achat` \| `lld` |
| `status` | Voir [§5](#5-enums-métier) |
| `client_id`, `vehicle_id` | FK obligatoires |
| `gestionnaire_id` | FK optionnelle (prise en charge) |
| `duree_mois`, `date_debut_contrat` | Contrat LLD (souvent 36 mois après livraison) |
| `draft_reminder_sent_at` | Job rappel brouillon (US-03-05) |
| `retention_alert_sent_at` | Job alerte fin contrat ≤ 3 mois (US-06-11) |
| `livraison_prevue_at` | Planification livraison (US-06-10) |
| `submitted_at`, `validated_at`, `rejected_at` | Jalons workflow |

**Date de fin LLD** : en général **non stockée** — calculée applicativement :

```text
date_fin = date_debut_contrat + duree_mois  (mois civils, voir lld_dossier_lifecycle._add_months)
```

### 4.4 Tables contrat et LLD

- **`dossier_contrats`** : relation **1-1** avec `dossiers` ; `body_markdown` ; jeton signature hashé.
- **`options_lld`** : une ligne par `(dossier_id, code)` — codes : `assurance`, `assistance`, `entretien`, `controle_technique`.
- **`lld_option_catalog`** + **`lld_option_price_history`** : tarification centralisée (US-07-03).
- **`lld_avenants`** : modifications d’options en `contrat_en_cours` ; JSON `selections`.

### 4.5 Diagramme simplifié (relations principales)

```text
users ─────┬──────────────────────────────────────────► dossiers ◄──── vehicles
           │                                        │      │
           │                                        │      ├── pieces_justificatives
           │                                        │      ├── dossier_historique
           │                                        │      ├── dossier_contrats (1-1)
           │                                        │      ├── options_lld
           │                                        │      └── lld_avenants
           │                                        │
           └── (gestionnaire_id)                    │
                                                    │
lld_option_catalog ◄── lld_option_price_history    │
```

Visualisation complète : importer [`schéma.dbml`](schéma.dbml) dans [dbdiagram.io](https://dbdiagram.io).

---

## 5. Enums métier

### 5.1 `role_enum` (`users.role`)

`client` | `gestionnaire` | `superviseur` | `admin`

### 5.2 `moteur_enum` (`vehicles.moteur`)

`Essence` | `Diesel` | `Hybride` | `Électrique`

### 5.3 `dossier_type_enum`

`achat` | `lld`

### 5.4 `dossier_status_enum` — cycle de vie

| Statut | Signification |
|--------|----------------|
| `brouillon` | Création client, pièces incomplètes |
| `depose` | Soumis |
| `en_instruction` | Gestionnaire assigné |
| `valide` | Approuvé (legacy / transition) |
| `en_signature` | Contrat généré, attente signature |
| `attente_livraison` | Signé, livraison à planifier |
| `livraison_planifiee` | Date de livraison fixée |
| `contrat_en_cours` | LLD actif (après livraison) |
| `cloture` | Terminé (fin contrat ou achat finalisé) |
| `rejete` | Refusé |
| `annule` | Annulé |

```text
brouillon → depose → en_instruction → … → en_signature → attente_livraison
    → livraison_planifiee → contrat_en_cours → cloture
```

### 5.5 PostgreSQL : extension des ENUM

Sous PostgreSQL, SQLAlchemy crée un type natif (ex. `dossierstatusenum`).  
**Ajouter une valeur** au modèle Python **ne suffit pas** : il faut une migration SQL du type :

```sql
ALTER TYPE dossierstatusenum ADD VALUE 'nouvelle_valeur';
```

Exemple projet : `010_pg_dossier_status_enum_us06_07.py` (`en_signature`, `attente_livraison`).  
**Supprimer** une valeur d’ENUM PostgreSQL est complexe (recréation de type) — éviter en prod.

---

## 6. Relations et intégrité

### 6.1 Clés étrangères principales

| Enfant | Parent | Comportement typique |
|--------|--------|----------------------|
| `dossiers.client_id` | `users.id` | RESTRICT |
| `dossiers.vehicle_id` | `vehicles.id` | RESTRICT |
| `dossiers.gestionnaire_id` | `users.id` | SET NULL |
| `pieces_justificatives.dossier_id` | `dossiers.id` | **CASCADE** |
| `dossier_historique.dossier_id` | `dossiers.id` | **CASCADE** |
| `dossier_contrats.dossier_id` | `dossiers.id` | **CASCADE**, unique |
| `options_lld.dossier_id` | `dossiers.id` | **CASCADE** |
| `lld_avenants.dossier_id` | `dossiers.id` | **CASCADE** |
| `vehicle_* .vehicle_id` | `vehicles.id` | **CASCADE** |
| `lld_option_price_history.option_code` | `lld_option_catalog.code` | **CASCADE** |

### 6.2 Contraintes d’unicité notables

| Contrainte | Table | Colonnes |
|------------|-------|----------|
| Référence dossier | `dossiers` | `reference` |
| Email actif | `users` | `email_hash` WHERE `deleted_at IS NULL` |
| Option par dossier | `options_lld` | `(dossier_id, code)` |
| Un contrat | `dossier_contrats` | `dossier_id` |

### 6.3 Index

Les colonnes filtrées en liste BO (`status`, `client_id`, `reference`, etc.) sont indexées dans les modèles. Vérifier les migrations si ajout de colonnes très sélectives à fort volume.

---

## 7. Données personnelles (PII) et chiffrement

### 7.1 Champs concernés (`users`)

| Colonne | Mécanisme |
|---------|-----------|
| `email`, `first_name`, `last_name` | `PgcryptoEncryptedText` |
| `birth_date` | `PgcryptoEncryptedDate` (stockée chiffrée en texte ISO) |
| `email_hash` | SHA-256 en clair pour recherche / unicité |

Implémentation : `backend/app/db/types.py` — `pgp_sym_encrypt` / `pgp_sym_decrypt` avec `PII_ENCRYPTION_KEY` (défaut : `SECRET_KEY`).

### 7.2 Quand le chiffrement est actif

```python
# is_pgcrypto_runtime_enabled() :
# - dialecte postgresql
# - ET ENVIRONMENT / ENV != "test"
```

| Environnement | Comportement ORM |
|---------------|------------------|
| **PostgreSQL prod/staging/dev** | Chiffrement actif |
| **Tests pytest (SQLite)** | Colonnes en clair (pas d’extension pgcrypto) |
| **CI unitaire** | `DATABASE_URL=sqlite:///...`, `ENVIRONMENT=test` |

### 7.3 Migration `015_us_11_01_pii`

- Active l’extension `pgcrypto`
- Ajoute `email_hash`, backfill
- Convertit les colonnes PII existantes
- Remplace l’unicité sur `email` par index partiel sur `email_hash`

### 7.4 Bonnes pratiques PII

- Ne jamais logger email / nom en clair en prod.
- Rechercher un utilisateur par **email_hash** (`client_email_search_hash` dans `app/utils/client_pii.py`).
- Les jetons email (confirmation, signature) sont stockés **hashés** (SHA-256), pas en clair.

---

## 8. Alembic — architecture

### 8.1 Fichiers

| Fichier | Rôle |
|---------|------|
| `backend/alembic.ini` | Config logging ; URL surchargée dans `env.py` |
| `backend/alembic/env.py` | Connexion, `target_metadata = Base.metadata` |
| `backend/alembic/versions/*.py` | Révisions linéaires |
| `backend/manage.py migrate` | Wrapper K8s avec **retry** Postgres (40 × 2 s) |

### 8.2 `env.py` — points critiques

1. **URL** : `settings.database_url` (échappement `%` pour ConfigParser).
2. **Métadonnées** : import explicite des modèles pour l’**autogenerate**.

Imports actuels (à **compléter** si nouveau fichier modèle) :

```python
import app.models.audit
import app.models.dossier
import app.models.lld_avenant
import app.models.user
import app.models.vehicle
```

Si un modèle n’est pas importé ici, `alembic revision --autogenerate` peut **ne pas détecter** la nouvelle table.  
**Recommandation :** ajouter l’import du nouveau module dans `env.py` (et éventuellement dans `001_initial_schema.py` si exclusion `MANAGED_BY_LATER_MIGRATIONS`).

### 8.3 Révision initiale `001_initial_schema`

- Utilise `Base.metadata.create_all()` pour créer les tables existantes à l’époque.
- **Exclut** `audit_trail` (créée par `006`).
- Les tables ajoutées plus tard ont leur propre migration dédiée.

### 8.4 Patterns de migration récurrents

| Pattern | Exemple | Usage |
|---------|---------|--------|
| Colonne nullable + backfill | `004`, `016` | Ajout champ avec idempotence `_has_column` |
| `batch_alter_table` | SQLite / Postgres | Alter sécurisé |
| `ALTER TYPE … ADD VALUE` | `010`, `013` | Nouveaux statuts dossier |
| Extension + SQL brut | `015` | pgcrypto, conversion PII |
| `op.create_table` | `006`, `009`, `014` | Nouvelles entités |

Beaucoup de migrations sont **idempotentes** (vérifient l’existence colonne/index avant `add`).

### 8.5 Déploiement Kubernetes

L’**initContainer** exécute typiquement :

```bash
python manage.py migrate --noinput
```

avant le démarrage des pods API. L’API **ne** lance **pas** les migrations au runtime (`main.py` lifespan).

---

## 9. Chaîne des migrations

Ordre linéaire actuel (HEAD = `016_us_06_11`) :

| # | Revision ID | Fichier | Sujet |
|---|-------------|---------|--------|
| 1 | `001_initial` | `001_initial_schema.py` | Schéma de base (users, vehicles, dossiers, …) |
| 2 | `002_us_02_01` | `002_us_02_01_client_registration_security.py` | Inscription, vérification email |
| 3 | `003_us_02_03` | `003_us_02_03_password_reset.py` | Reset mot de passe |
| 4 | `004_us_03_05` | `004_us_03_05_draft_reminder.py` | `draft_reminder_sent_at` |
| 5 | `005_us_04_04` | `005_us_04_04_lld_contrats.py` | Dates / champs contrat LLD client |
| 6 | `006_us_11_04` | `006_us_11_04_audit_trail.py` | Table `audit_trail` |
| 7 | `007_us_07_01` | `007_us_07_01_options_lld.py` | Table `options_lld` |
| 8 | `008_us_07_03` | `008_us_07_03_lld_catalog.py` | Catalogue + historique prix |
| 9 | `009_us_06_07` | `009_us_06_07_contrat_signature.py` | `dossier_contrats` |
| 10 | `010_pg_dossier_status` | `010_pg_dossier_status_enum_us06_07.py` | ENUM `en_signature`, `attente_livraison` |
| 11 | `011_us_06_10` | `011_us_06_10_livraison_planifiee.py` | `livraison_prevue_at` |
| 12 | `012_us_06_09` | `012_us_06_09_cloture.py` | Support clôture auto |
| 13 | `013_us_06_contrat_en_cours` | `013_us_06_contrat_en_cours_statut.py` | ENUM `contrat_en_cours` |
| 14 | `014_us_06_08` | `014_us_06_08_lld_avenants.py` | Table `lld_avenants` |
| 15 | `015_us_11_01_pii` | `015_us_11_01_pii_encryption_at_rest.py` | Chiffrement PII + `email_hash` |
| 16 | `016_us_06_11` | `016_us_06_11_retention_alert.py` | `retention_alert_sent_at` |

Commandes utiles :

```bash
cd backend
alembic current          # révision appliquée
alembic history          # liste complète
alembic heads            # tête de branche
```

---

## 10. Workflow développeur

### 10.1 Appliquer les migrations (local Docker)

```bash
# Depuis la racine du monorepo
make migrate
# équivalent :
docker compose exec backend alembic upgrade head
```

### 10.2 Créer une nouvelle migration

1. Modifier les modèles dans `backend/app/models/`.
2. Ajouter l’import du modèle dans `alembic/env.py` si nouveau fichier.
3. Générer :

```bash
make migration name="us_xx_yy_description"
# équivalent :
docker compose exec backend alembic revision --autogenerate -m "us_xx_yy_description"
```

4. **Relire** le script généré (autogenerate peut rater les ENUM, les données backfill, les index partiels).
5. Tester :

```bash
make migrate
make test-backend
```

6. Mettre à jour [`schéma.dbml`](schéma.dbml) pour la doc (manuellement ou export).

### 10.3 Nommage conventionnel

```text
NNN_us_<epic>_<description>.py
revision = "NNN_us_..."
down_revision = "<revision_précédente>"
```

Exemple : `016_us_06_11_retention_alert.py`.

### 10.4 Rollback (développement uniquement)

```bash
docker compose exec backend alembic downgrade -1
# ou vers une revision :
docker compose exec backend alembic downgrade 014_us_06_08_lld_avenants
```

**Attention :** certaines migrations ont `downgrade()` vide (ENUM PostgreSQL, conversions PII). Ne pas dégrader en prod sans procédure validée.

### 10.5 Connexion SQL directe

```bash
make shell-db
# psql -U mmotors -d mmotors

\dt                    -- tables
\d dossiers            -- structure
SELECT id, reference, status FROM dossiers LIMIT 10;
```

---

## 11. Environnements (PostgreSQL vs SQLite)

| Contexte | URL typique | Migrations | PII |
|----------|-------------|------------|-----|
| Docker dev | `postgresql://mmotors:mmotors@db:5432/mmotors` | Alembic complet | Oui |
| CI backend | Service Postgres éphémère | `upgrade head` avant tests | Selon `ENVIRONMENT` |
| Tests unitaires pytest | `sqlite:///./pytest_unit.db` | `create_all` via `conftest` reset | Non |
| Production K8s | Secret `DATABASE_URL` | initContainer `manage.py migrate` | Oui |

Les tests unitaires **recréent** le schéma via `Base.metadata.create_all()` à chaque test — ils **ne valident pas** les migrations Alembic. Les tests d’intégration + CI Postgres couvrent le DDL réel.

---

## 12. Requêtes, performances et bonnes pratiques

### 12.1 Accès depuis l’application

- Toujours passer par une **session** SQLAlchemy (`get_db()`).
- Préférer `joinedload` / `selectinload` pour éviter N+1 sur listes BO (ex. dossiers + client + véhicule).
- Appeler `close_expired_lld_contract_dossiers(db)` avant les listes contrats si l’échéance doit être matérialisée en `cloture`.

### 12.2 Agrégations reporting

Le reporting superviseur (`/api/v1/reporting/*`) utilise des `GROUP BY` SQLAlchemy sur `dossiers` — pas de tables de fait dédiées (pas de star schema).

### 12.3 Transactions

- Un endpoint = en général **une transaction** (`commit` explicite après modifications).
- En cas d’erreur non gérée, la session est fermée sans commit (rollback implicite).

### 12.4 Ce qu’il ne faut pas faire

- Modifier le schéma à la main en prod sans migration.
- Stocker des fichiers volumineux en BYTEA.
- Dupliquer des emails en clair hors `email_hash` / chiffrement.
- Supposer que SQLite en test prouve le comportement pgcrypto.

---

## 13. Sauvegarde, seed et exploitation

### 13.1 Données de démonstration

```bash
make seed
# scripts/seed.py — véhicules exemples (pas de dossiers complets)
```

### 13.2 Compte administrateur

```bash
make admin
# scripts/create_admin.py — interactif
```

### 13.3 Sauvegarde PostgreSQL (ops)

Exemple manuel :

```bash
docker compose exec db pg_dump -U mmotors -d mmotors -Fc -f /tmp/mmotors.dump
```

En production : politique de backup du VPS / opérateur cloud (hors scope application).

### 13.4 Rétention

- **Audit trail** : commentaire métier « rétention 5 ans minimum » dans DBML.
- **Comptes clients** : soft delete + job purge (`CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS` dans settings).

---

## 14. Guide : faire évoluer le schéma

### Cas A — Nouvelle colonne nullable

1. Ajouter `Mapped[Optional[...]]` sur le modèle.
2. Migration : `op.add_column(..., nullable=True)` avec `_has_column` si idempotence souhaitée.
3. Déployer migration **avant** le code qui écrit la colonne (ou même release avec nullable).

### Cas B — Nouvelle table

1. Créer `app/models/nouvelle_table.py` + relation sur modèles existants.
2. Importer dans `alembic/env.py`.
3. Migration `op.create_table` (+ index/FK).
4. Exclure de `MANAGED_BY_LATER_MIGRATIONS` dans `001` si jamais recréé from scratch (ou laisser create_all gérer en dev SQLite only).

### Cas C — Nouvelle valeur de statut dossier

1. Ajouter dans `DossierStatusEnum` (Python).
2. Migration PostgreSQL `ALTER TYPE dossierstatusenum ADD VALUE '...'` (pattern `010` / `013`).
3. Mettre à jour DBML + doc user story.
4. Pas de `downgrade` trivial.

### Cas D — Colonne PII

- Utiliser `PgcryptoEncryptedText` / `PgcryptoEncryptedDate`.
- Prévoir backfill en migration PostgreSQL (voir `015`).
- Ne pas indexer la colonne chiffrée pour recherche — utiliser un hash dédié si besoin.

### Checklist avant merge

- [ ] Modèle ORM à jour
- [ ] Migration testée `upgrade head` sur Postgres vierge + existant
- [ ] `env.py` importe le modèle
- [ ] Tests unitaires / intégration verts
- [ ] `schéma.dbml` mis à jour
- [ ] User story / doc API si impact fonctionnel

---

## 15. Dépannage fréquent

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `relation "vehicles" does not exist` | Migrations non appliquées | `make migrate` |
| `invalid input value for enum` | Statut Python ajouté sans migration ENUM | Créer migration `ALTER TYPE … ADD VALUE` |
| Autogenerate ne voit pas une table | Modèle non importé dans `env.py` | Ajouter `import app.models....` |
| Login impossible après restore DB | `email_hash` manquant / désaligné | Rejouer migration `015` ou recalculer hash |
| Tests OK mais prod casse | Différence SQLite / Postgres | Tester migration sur Postgres |
| `DuplicateTable` sur upgrade | `001` + migration créent la même table | Exclure table de `001` ou ne pas create_all deux fois |
| Alembic % dans URL | Mot de passe avec `%` | Déjà géré : `.replace("%", "%%")` dans `env.py` |
| Connexion refusée au boot K8s | Postgres pas prêt | `manage.py migrate` retry ; vérifier ordre déploiement |

---

## 16. Documentation complémentaire

| Document | Contenu |
|----------|---------|
| [`schéma.dbml`](schéma.dbml) | Diagramme ER, enums, notes colonnes |
| [`../backend/README.md`](../backend/README.md) | API, services, tests backend |
| [`../frontend/README.md`](../frontend/README.md) | Consommation API côté UI |
| `docs/UserStories/` | Règles métier par epic |
| `docs/k8s/` | Déploiement, secrets `DATABASE_URL` |
| `backend/app/models/` | Définition ORM détaillée |
| `backend/alembic/versions/` | Scripts DDL historisés |

---

*Dernière mise à jour : PostgreSQL 16, chaîne Alembic jusqu’à `016_us_06_11` (`retention_alert_sent_at`), chiffrement PII `015`.*
