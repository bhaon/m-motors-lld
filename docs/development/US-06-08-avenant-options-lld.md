# US-06-08 — Avenant et signature pour modification d’options LLD sous contrat en cours

## Objectif

Lorsque le dossier LLD est au statut **`contrat_en_cours`**, toute modification des options ne s’applique pas immédiatement : un **avenant** est généré à partir du gabarit `backend/app/templates/avenant.md`, le client reçoit un **e-mail** avec un **lien de signature** (24 h, même mécanisme que le contrat initial). Après validation, les options en base sont mises à jour et la **mensualité totale (HT)** affichée dans **Mes contrats** reflète base + options.

## Comportement

| Étape | Détail |
|--------|--------|
| Client modifie les options | `PATCH /api/v1/dossiers/{id}/options-lld` |
| Si statut ≠ `contrat_en_cours` | Comportement historique : mise à jour immédiate + audit `LLD_OPTIONS_UPDATED` |
| Si statut = `contrat_en_cours` | Pas de mise à jour des lignes `options_lld` tant que l’avenant n’est pas signé ; création d’une ligne `lld_avenants`, e-mail avec lien vers `/confirm-avenant-signature?token=…` |
| Avenant déjà en attente | `409` (après expiration du jeton précédent > 24 h, l’ancienne demande est supprimée et une nouvelle est possible) |
| Signature | `GET /api/v1/auth/confirm-avenant-signature?token=` → application des sélections, `signed_at` sur l’avenant, audit `LLD_AVENANT_SIGNE` |
| Page contrats | `GET /api/v1/dossiers/contrats` expose `total_mensualite_ht` (somme base véhicule + options cochées, HT) |

## Données

- Table **`lld_avenants`** (migration **014**) : `reference`, `body_markdown`, `selections` (JSON), jetons de signature, `signed_at`.

## Tests

- `tests/unit/test_us_06_08_lld_avenant.py`
- Frontend : couvrir la page `confirm-avenant-signature` sur le même modèle que `confirm-contract-signature` si besoin.

## Limites produit

- Un seul avenant **non signé** à la fois par dossier.
- Renouvellement possible après expiration du lien (nettoyage automatique à la prochaine tentative `PATCH`).
