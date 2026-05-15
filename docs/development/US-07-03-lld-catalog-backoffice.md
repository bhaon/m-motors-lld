# US-07-03 — Catalogue options LLD (back-office)

## Objectif

Permettre aux **gestionnaires** (ainsi qu’aux superviseurs et administrateurs) de piloter l’offre d’options LLD : textes affichés aux clients, **activation** par interrupteur métier, et **tarifs versionnés** avec historique.

## DoD — Réalisation

| Critère | Implémentation |
|--------|----------------|
| Interface back-office | Page [`/backoffice/options-lld`](frontend/src/app/backoffice/options-lld/page.tsx) ; entrée menu **Options LLD** (profils gestionnaire et au-delà). |
| Activation sans modifier le schéma `options_lld` | Table **`feature_flags`** (`key`, `value_bool`) ; clés du type `lld_option.<code>.enabled`. |
| Prix avec historique | Table **`lld_option_price_history`** ; tarif courant = enregistrement le plus récent par date `valid_from`. |

## API (JWT cookie ou Bearer, rôle gestionnaire / superviseur / admin)

Base : `/api/v1/backoffice/lld-catalog`

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/` | Liste des options avec libellé, description, tarif courant, activation. |
| `PATCH` | `/{code}` | Met à jour `label` et/ou `description`. |
| `PUT` | `/{code}/activation` | Corps `{ "enabled": boolean }` — désactive aussi les sélections sur toutes les lignes `options_lld`. |
| `POST` | `/{code}/price` | Corps `{ "surcout_mensuel_ht": number }` — ajoute une ligne d’historique. |
| `GET` | `/{code}/price-history` | Liste décroissante des tarifs (montant, date, auteur optionnel). |

Les dossiers **existants** conservent le surcoût enregistré sur `options_lld` ; les **nouvelles** lignes créées lors de la constitution du dossier reprennent le **tarif catalogue courant** au moment de la création de la ligne.

## Modèle de données

- **`lld_option_catalog`** : `code` (PK), `label`, `description`.
- **`lld_option_price_history`** : `option_code` → catalogue, `price_ht`, `valid_from`, `created_by_user_id`.
- **`feature_flags`** : activation générique (réutilisable hors LLD).

Migration Alembic : `008_us_07_03`.

## Tests

- Backend : [`tests/unit/test_us_07_03_lld_catalog_bo.py`](../backend/tests/unit/test_us_07_03_lld_catalog_bo.py).
- Frontend : [`tests/app/backoffice-options-lld-page.test.tsx`](../frontend/tests/app/backoffice-options-lld-page.test.tsx).

## Voir aussi

- US-07-01 / US-07-02 : souscription et adaptation des options côté client (basées sur ce catalogue filtré par flags).
