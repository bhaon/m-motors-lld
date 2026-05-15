# US-06-09 — Livraison de véhicule et début du LLD

## Objectif

Lorsqu’un dossier est en **livraison planifiée**, le personnel du back-office enregistre la **livraison effective**. Pour un **LLD**, le dossier passe en **contrat en cours** et le terme du leasing commence (dates pour l’espace **Mes contrats**). Pour un **achat**, le dossier est **clôturé** dès la livraison. La **clôture** d’un LLD intervient **à l’échéance** du contrat (date de fin dépassée), via une transition automatique.

## Interface back-office

- **Page** : liste **Dossiers en attente** (`/backoffice/dossiers`).
- **Bouton** : **« Livraison »** dans la colonne Action lorsque le statut est **`livraison_planifiee`**.
- **Action** : appelle `POST /api/v1/dossiers/backoffice/{id}/effectuer-livraison` (gestionnaire, superviseur ou admin).

## Comportement métier

| Cas | Effet |
|-----|--------|
| Type **LLD** | Statut → **`contrat_en_cours`**. **`date_debut_contrat`** = jour calendaire (**Europe/Paris**) de la livraison planifiée (`livraison_prevue_at`). **`duree_mois`** = **36** (3 ans). |
| Type **achat** | Statut → **`cloture`**. Pas de dates de contrat LLD (champs inchangés `null`). |
| Fin de contrat LLD | Tant que **`date_debut_contrat` + `duree_mois`** n’est pas passée, le dossier reste **`contrat_en_cours`**. Ensuite : **`cloture`** (historique + lectures listes/détails). |
| Prérequis | Statut exactement **`livraison_planifiee`** et **`livraison_prevue_at`** renseigné (sinon 400 / 409). |

## Espace client — Mes contrats

`GET /api/v1/dossiers/contrats` inclut les dossiers LLD aux statuts **`contrat_en_cours`** et **`cloture`**. La **date de début** affichée correspond à **`date_debut_contrat`** ; la **date de fin** est calculée comme **début + durée en mois** en base.

## Données

- Statuts enum : **`contrat_en_cours`**, **`cloture`**.
- Migrations PostgreSQL : **012** (`cloture`), **013** (`contrat_en_cours` + migration des anciens LLD encore sous contrat).

## Audit

Action enregistrée : **`DOSSIER_LIVRAISON_EFFECTUEE`**. Un email de changement de statut est envoyé au client (notification habituelle).

## Tests

- Backend : `tests/unit/test_us_06_09_effectuer_livraison.py`, `tests/unit/test_lld_dossier_lifecycle.py`.
- Reporting : synthèses incluant **`contrat_en_cours`** / **`cloture`**.
- Frontend : `backoffice-dossiers.test.tsx` (bouton + POST), `StatusBadge.test.tsx`.
