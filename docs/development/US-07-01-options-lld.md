# US-07-01 — Options LLD à la souscription

## Objectif

Permettre au **client** de visualiser et activer ou désactiver les quatre options LLD standard (assurance, assistance, entretien, contrôle technique) lors de la constitution du dossier, avec affichage du **surcoût mensuel HT** et du **total mensuel** recalculé dynamiquement.

## Périmètre fonctionnel

| Critère DoD | Réalisation |
|-------------|-------------|
| 4 options avec descriptif et surcoût mensuel HT | Catalogue métier dans `app/services/lld_options_catalog.py` ; rendu dans `LldOptionsSection.tsx`. |
| Sélection / désélection indépendantes | Cases à cocher par option ; `PATCH` avec payload `selections` par code. |
| Total mensuel dynamique | Calcul côté API (`build_lld_options_state`) et prévisualisation locale dans l’UI avant/après sauvegarde. |
| Persistance | Table PostgreSQL **`options_lld`** (migration Alembic `007_us_07_01`), une ligne par `(dossier_id, code)`, champ `selected`. |

## Modèle de données

- **Table** `options_lld`  
  - `dossier_id` → `dossiers.id` (CASCADE)  
  - `code` : `assurance` \| `assistance` \| `entretien` \| `controle_technique`  
  - `selected` : booléen  
  - `surcout_mensuel_ht` : `Numeric(10,2)` (valeur catalogue au moment de la création de la ligne)  
  - contrainte d’unicité `(dossier_id, code)`

Les lignes sont créées automatiquement à la **création d’un dossier LLD** ou au premier chargement du détail si dossiers historiques sans lignes.

## API

| Méthode | Chemin | Description |
|---------|--------|----------------|
| `GET` | `/api/v1/dossiers/{id}` | Réponse enrichie avec `lld_pricing` (null si dossier « achat »). |
| `PATCH` | `/api/v1/dossiers/{id}/options-lld` | Corps : `{ "selections": { "assurance": true, ... } }`. **Uniquement** dossier `lld` en statut `brouillon`. |

Schémas Pydantic : `LldOptionsPricingOut`, `LldOptionRowOut`, `LldOptionsPatchIn` dans `app/schemas/dossier.py`.

## Interface client

- Page **`/mes-dossiers/[id]`** : bloc « Options de votre abonnement LLD » au-dessus de la checklist des pièces, pour les dossiers LLD disposant de `lld_pricing`.

## Tests

- Backend : `tests/unit/test_us_07_01_lld_options.py`
- Frontend : `tests/components/LldOptionsSection.test.tsx`, scénario dédié dans `tests/app/mes-dossiers-detail-page.test.tsx`

## Déploiement

Après mise à jour du code, appliquer les migrations :

```bash
cd backend && alembic upgrade head
```
