# US-06-09 — Livraison de véhicule et début du LLD

## Objectif

Lorsqu’un dossier est en **livraison planifiée**, le personnel du back-office enregistre la **livraison effective**. Le dossier est **clôturé** ; pour un contrat **LLD**, le terme du leasing commence : dates contractuelles fixées pour l’espace client **Mes contrats**.

## Interface back-office

- **Page** : liste **Dossiers en attente** (`/backoffice/dossiers`).
- **Bouton** : **« Livraison »** dans la colonne Action lorsque le statut est **`livraison_planifiee`**.
- **Action** : appelle `POST /api/v1/dossiers/backoffice/{id}/effectuer-livraison` (gestionnaire, superviseur ou admin).

## Comportement métier

| Cas | Effet |
|-----|--------|
| Type **LLD** | Statut → **`cloture`**. **`date_debut_contrat`** = jour calendaire (**Europe/Paris**) de la livraison planifiée (`livraison_prevue_at`). **`duree_mois`** = **36** (3 ans). |
| Type **achat** | Statut → **`cloture`**. Pas de dates de contrat LLD (champs inchangés `null`). |
| Prérequis | Statut exactement **`livraison_planifiee`** et **`livraison_prevue_at`** renseigné (sinon 400 / 409). |

## Espace client — Mes contrats

`GET /api/v1/dossiers/contrats` inclut les dossiers LLD au statut **`cloture`**. La **date de début** affichée correspond à **`date_debut_contrat`** ; la **date de fin** est calculée comme **début + 36 mois** (même règle que les autres contrats LLD avec durée en base).

## Données

- Nouveau statut enum : **`cloture`**.
- Migration **012** : ajout de la valeur PostgreSQL `cloture` sur `dossierstatusenum`.

## Audit

Action enregistrée : **`DOSSIER_LIVRAISON_EFFECTUEE`**. Un email de changement de statut est envoyé au client (notification habituelle).

## Tests

- Backend : `tests/unit/test_us_06_09_effectuer_livraison.py`.
- Reporting : clé `cloture` dans les tests de synthèse.
- Frontend : `backoffice-dossiers.test.tsx` (bouton + POST), `StatusBadge.test.tsx`.
