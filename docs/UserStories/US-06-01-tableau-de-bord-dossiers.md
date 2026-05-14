# US-06-01 — Tableau de bord gestionnaire : dossiers en attente

## Objectif

Permettre au gestionnaire de **consulter la liste des dossiers en attente de traitement** avec des filtres, un tri par ancienneté et une pagination, afin de prioriser son travail.

---

## Critères d'acceptation (DoD)

| Critère | Implémentation |
|---|---|
| Liste filtrée par défaut sur "Déposé" et "En instruction" | Paramètre `statuts` défaut = `["depose", "en_instruction"]` |
| Filtres disponibles : type de contrat, statut, date de dépôt | Query params `type_contrat`, `statuts[]`, `date_from`, `date_to` |
| Tri par date de dépôt (plus anciens en premier par défaut) | `sort=submitted_asc` par défaut |
| Pagination pour les grandes listes | `page` + `page_size` (défaut 20, max 100) |

---

## Endpoint API

```
GET /api/v1/dossiers/backoffice
```

**Accès** : gestionnaire, superviseur, admin (Cookie JWT).

### Paramètres query

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `statuts` | `string[]` | `depose,en_instruction` | Répétable : `?statuts=depose&statuts=valide` |
| `type_contrat` | `achat` \| `lld` | — | Filtre sur le type de contrat |
| `date_from` | `datetime` | — | Dossiers soumis à partir de cette date (ISO 8601) |
| `date_to` | `datetime` | — | Dossiers soumis jusqu'à cette date (ISO 8601) |
| `sort` | `submitted_asc` \| `submitted_desc` \| `created_desc` | `submitted_asc` | Critère de tri |
| `page` | `int` ≥ 1 | `1` | Numéro de page |
| `page_size` | `int` 1–100 | `20` | Nombre d'éléments par page |

### Réponse `200 OK`

```json
{
  "total": 47,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 12,
      "reference": "DOS-2026-00012",
      "type": "lld",
      "status": "depose",
      "submitted_at": "2026-03-01T14:32:00Z",
      "created_at": "2026-02-28T09:00:00Z",
      "pieces_count": 3,
      "vehicle": { "make": "Renault", "model": "Clio", "year": 2022 },
      "client": {
        "id": 5,
        "email": "jean.dupont@example.com",
        "first_name": "Jean",
        "last_name": "Dupont"
      }
    }
  ]
}
```

### Erreurs

| Code | Cause |
|---|---|
| `401` | Cookie absent ou expiré |
| `403` | Rôle insuffisant (client) |
| `422` | Valeur de `statuts` ou `type_contrat` inconnue |

---

## Interface front-office

**Route** : `/backoffice/dossiers`  
**Accès** : lien "Dossiers en attente" dans le menu déroulant gestionnaire de la Navbar.

### Panneau de filtres

- **Statut** — boutons chip multiselect (Brouillon / Déposé / En instruction / Validé / Rejeté / Annulé)
- **Type** — select (Tous / Achat / LLD)
- **Déposé depuis** — sélecteur de date
- **Déposé jusqu'au** — sélecteur de date
- **Tri** — select (Dépôt anciens en premier ← défaut / Dépôt récents en premier / Création récente)

Les filtres sont appliqués au clic sur **Appliquer** (non en temps réel) pour éviter les requêtes inutiles.  
**Réinitialiser** remet les valeurs par défaut.

### Tableau

Colonnes : Référence · Client (nom + email) · Véhicule · Type · Statut · Pièces (n/5) · Déposé le · Ancienneté

L'ancienneté est colorée :
- **Vert** — ≤ 3 jours
- **Orange** — 4 à 7 jours
- **Rouge** — > 7 jours (dossier en retard)

### Pagination

Boutons "← Précédent" / "Suivant →" visibles uniquement si `total > page_size`.

---

## Architecture

```
backend/
  app/schemas/dossier.py          ← ClientSummaryOut, DossierBoItemOut, DossierBoListOut
  app/api/v1/endpoints/dossiers.py ← GET /backoffice (remplace la version simplifiée)
  tests/unit/test_dossiers_backoffice.py

frontend/
  src/app/backoffice/dossiers/page.tsx  ← Page tableau de bord
  src/components/Navbar.tsx             ← Lien "Dossiers en attente" (gestionnaire)
  tests/app/backoffice-dossiers.test.tsx
```

---

## Tests

### Backend (pytest)

```bash
python -m pytest tests/unit/test_dossiers_backoffice.py -v
```

Couvre : accès (401/403), filtre statut (défaut + explicite + invalide), filtre type, filtres date, tri (asc/desc), pagination (page_size, page 2), contenu de la réponse (client, véhicule, pieces_count).

### Frontend (Jest)

```bash
npx jest tests/app/backoffice-dossiers.test.tsx
```

Couvre : rendu initial, statuts par défaut, appel API au montage, affichage données, états vide/erreur, filtres, tri, pagination.
