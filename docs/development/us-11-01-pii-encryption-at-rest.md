# US-11-01 — Données personnelles chiffrées au repos (RGPD)

## Objectif

Réduire l’exposition des données personnelles clients en base : email et date de naissance chiffrés avec **pgcrypto** (OpenPGP symétrique, algorithme **AES-256**), recherche par email via une empreinte **SHA-256** déterministe, et chiffrement disque côté **Amazon RDS**.

## Réalisation applicative

### Chiffrement colonnes (PostgreSQL)

- **Email** : colonne stockée en `bytea`, chiffrement/déchiffrement via `pgp_sym_encrypt` / `pgp_sym_decrypt` avec l’option `cipher-algo=aes256` (aligné sur `first_name` / `last_name`).
- **Date de naissance** : stockée en `bytea`, texte ISO `YYYY-MM-DD` chiffré (type SQLAlchemy `PgcryptoEncryptedDate`).
- **Clé** : variable `PII_ENCRYPTION_KEY` (sinon repli sur `SECRET_KEY`), identique aux autres champs PII.

### Empreinte `email_hash`

- Colonne `email_hash` : chaîne hexadécimale de 64 caractères (**SHA-256**).
- Normalisation avant hachage : `strip()` + **minuscules** (fonction `normalized_client_email` / `client_email_search_hash` dans `app/utils/client_pii.py`).
- **Unicité** : index unique partiel PostgreSQL `uq_users_email_hash_active` sur `email_hash` avec condition `WHERE deleted_at IS NULL` (comptes actifs uniquement ; réutilisation possible après soft-delete).
- Les requêtes métier (login, inscription, admin, scripts) filtrent sur `User.email_hash == client_email_search_hash(...)` et ne comparent plus l’email en clair en SQL.

### Environnement de tests (`ENV=test`)

La couche ORM pgcrypto est **désactivée** sur PostgreSQL en tests (voir `is_pgcrypto_runtime_enabled`) pour éviter les dépendances implicites ; les tests d’intégration qui vérifient les types `bytea` ne s’exécutent que lorsque PostgreSQL est utilisé **sans** `ENV=test`.

### Migration base

Fichier : `backend/alembic/versions/015_us_11_01_pii_encryption_at_rest.py`

- Ajout et remplissage de `email_hash`.
- Suppression de l’unicité sur `email` en clair, chiffrement des colonnes `email` et `birth_date`, `email_hash` en `NOT NULL`, création de l’index unique partiel.

## Chiffrement RDS (disque)

Le chiffrement au repos des **volumes RDS** est une configuration **infrastructure AWS**, indépendante du code applicatif :

- Lors de la création (ou restauration) d’une instance RDS PostgreSQL, activer **Storage encryption** et choisir une clé **KMS** (CMK gérée AWS ou gérée client).
- Les instances existantes non chiffrées ne peuvent pas être « activées » in-place : il faut un snapshot chiffré ou une migration (nouvelle instance chiffrée + bascule).
- Documenter la clé KMS, la rotation et les politiques IAM associées dans le runbook d’exploitation.

Référence : [AWS RDS — Encrypting Amazon RDS resources](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html).

## Fichiers principaux

| Fichier | Rôle |
|--------|------|
| `backend/app/db/types.py` | `PgcryptoEncryptedDate`, `PgcryptoEncryptedText` (AES-256) |
| `backend/app/utils/client_pii.py` | Normalisation + `client_email_search_hash` |
| `backend/app/models/user.py` | Colonnes `email`, `email_hash`, `birth_date`, validateur email |
| `backend/app/api/v1/endpoints/auth.py` | Recherches par `email_hash` |
| `backend/app/api/v1/endpoints/admin.py` | Idem création utilisateur admin |
| `backend/scripts/create_admin.py` | Détection de compte existant par `email_hash` |
| `backend/tests/unit/test_us_11_01_pii_encryption.py` | Tests empreinte et validateur |

## Exploitation

- Conserver `PII_ENCRYPTION_KEY` dans un secret (Kubernetes Secret, SSM, Vault) et **ne pas** la committer.
- Après déploiement de la migration, vérifier sur une base PostgreSQL : `\d+ users` doit montrer `email` et `birth_date` en `bytea`, et l’index `uq_users_email_hash_active` présent.
