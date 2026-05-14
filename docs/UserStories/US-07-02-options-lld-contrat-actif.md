# US-07-02 — Modifier les options LLD après souscription (contrat actif)

## Objectif

Permettre au **client** d’adapter ses options LLD **après** la souscription initiale, tant que le **contrat LLD validé est encore actif**, avec traçabilité et confirmation du nouveau montant.

## Critères de définition de terminé

| Critère | Réalisation |
|--------|--------------|
| Modification depuis l’espace client sur contrats actifs | Lien **« Adapter les options »** sur `/mes-contrats` (contrats actifs uniquement) vers `/mes-dossiers/{id}#lld-options-section`. Édition autorisée côté API si dossier `lld`, statut `valide` et période contractuelle non expirée (même logique que `GET /dossiers/contrats`). |
| Chaque modification tracée avec horodatage | Action **`LLD_OPTIONS_UPDATED`** dans `audit_trail` (`created_at` UTC, états avant/après : sélections + totaux HT), opérateur = client. Aucune entrée si la requête ne change rien. |
| Nouveau montant mensuel confirmé avant validation | Composant **`LldOptionsSection`** : enregistrement via bouton puis **modale de confirmation** (ancien total vs nouveau total) avant `PATCH`. |

## API

- **`PATCH /api/v1/dossiers/{id}/options-lld`** : accepté si  
  - dossier LLD en **brouillon**, ou  
  - dossier LLD **validé** avec contrat **encore actif** (`date_fin` absente ou ≥ aujourd’hui).
- Réponse **`lld_pricing.edit_context`** : `brouillon` \| `contrat_actif` \| `readonly`.
- Contrat expiré : `400` avec message explicite.

## Données

Pas de nouvelle table : réutilisation de **`options_lld`** et de **`audit_trail`** (US-11-04).

## Tests

- Backend : `tests/unit/test_us_07_02_lld_options_contrat_actif.py`
- Frontend : comportement de confirmation couvert via les tests composant / page existants (à étendre si besoin).

## Voir aussi

- [US-07-01 — Options à la souscription](US-07-01-options-lld.md)
