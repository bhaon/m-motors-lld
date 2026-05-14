# US-04-01 — Tableau de bord personnel client

**En tant que** client, **je veux** accéder à un tableau de bord personnel **afin de** voir l'état de tous mes dossiers en un coup d'œil.

---

## Critères d'acceptation (DoD)

| # | Critère | Statut |
|---|---------|--------|
| 1 | Le tableau de bord affiche tous les dossiers du client avec leur statut actuel | ✅ |
| 2 | Les statuts sont : Brouillon, Déposé, En instruction, Validé, Rejeté, Annulé | ✅ |
| 3 | Chaque dossier affiche : référence, véhicule concerné, type (Achat/LLD), date de création, statut | ✅ |
| 4 | Un lien direct vers le détail de chaque dossier est disponible | ✅ |

---

## Architecture des changements

### Vue d'ensemble

```
┌─ Backend ─────────────────────────────────────────┐
│  GET /api/v1/dossiers/me                          │
│  schemas/dossier.py : DossierListItemOut          │
│              + VehicleSummaryOut                  │
│  endpoints/dossiers.py : joinedload(Dossier.vehicle) │
└───────────────────────────────────────────────────┘
              │  JSON avec vehicle { make, model, year }
              ▼
┌─ Frontend ────────────────────────────────────────┐
│  types/index.ts : DossierStatus, DossierListItem  │
│  components/StatusBadge.tsx  (nouveau)            │
│  app/mes-dossiers/page.tsx   (refactorisé)        │
└───────────────────────────────────────────────────┘
```

---

## Détail des modifications

### Backend

#### `app/schemas/dossier.py`

Deux nouveaux schémas Pydantic :

```python
class VehicleSummaryOut(BaseModel):
    make: str   # Marque (ex: "Renault")
    model: str  # Modèle (ex: "Clio")
    year: int   # Millésime (ex: 2024)

class DossierListItemOut(BaseModel):
    id: int
    reference: str          # ex: "DOS-2026-00042"
    type: DossierTypeEnum   # "achat" | "lld"
    status: str             # voir DossierStatusEnum
    vehicle_id: int
    client_id: int
    created_at: datetime | None
    vehicle: VehicleSummaryOut
```

#### `app/api/v1/endpoints/dossiers.py`

Le endpoint `GET /api/v1/dossiers/me` est mis à jour :

- **Avant** : retournait `list[DossierCreateOut]` sans infos véhicule
- **Après** : retourne `list[DossierListItemOut]` avec `joinedload(Dossier.vehicle)` pour éviter N+1 queries

```python
dossiers = (
    db.query(Dossier)
    .options(joinedload(Dossier.vehicle))
    .filter(Dossier.client_id == user.id)
    .order_by(Dossier.created_at.desc(), Dossier.id.desc())
    .all()
)
```

Exemple de réponse JSON :

```json
[
  {
    "id": 1,
    "reference": "DOS-2026-00042",
    "type": "lld",
    "status": "brouillon",
    "vehicle_id": 10,
    "client_id": 5,
    "created_at": "2026-05-07T10:15:00Z",
    "vehicle": {
      "make": "Renault",
      "model": "Clio",
      "year": 2024
    }
  }
]
```

---

### Frontend

#### `src/types/index.ts` — Nouveaux types

```typescript
export type DossierStatus =
  | "brouillon" | "depose" | "en_instruction"
  | "valide" | "rejete" | "annule";

export type DossierType = "achat" | "lld";

export interface DossierVehicle {
  make: string;
  model: string;
  year: number;
}

export interface DossierListItem {
  id: number;
  reference: string;
  type: DossierType;
  status: DossierStatus;
  vehicle_id: number;
  client_id: number;
  created_at: string | null;
  vehicle: DossierVehicle;
}
```

#### `src/components/StatusBadge.tsx` — Nouveau composant

Badge coloré représentant le statut d'un dossier.

| Statut backend   | Libellé affiché  | Couleur   |
|-----------------|-----------------|-----------|
| `brouillon`     | Brouillon       | Gris      |
| `depose`        | Déposé          | Bleu      |
| `en_instruction`| En instruction  | Ambre     |
| `valide`        | Validé          | Vert      |
| `rejete`        | Rejeté          | Rouge     |
| `annule`        | Annulé          | Gris foncé|

Props :

```typescript
interface StatusBadgeProps {
  status: DossierStatus;
}
```

Accessibilité : `role="status"` + `aria-label="Statut : <libellé>"`.

#### `src/app/mes-dossiers/page.tsx` — Tableau de bord refactorisé

La page `/mes-dossiers` devient le tableau de bord principal. Colonnes affichées :

| Colonne | Contenu |
|---------|---------|
| Référence | Lien cliquable `DOS-YYYY-NNNNN` → `/mes-dossiers/:id` |
| Véhicule | Marque + Modèle (gras) / Millésime (sous-texte) |
| Type | Badge `Achat` (bleu navy) ou `LLD` (cyan) |
| Date de création | Format `JJ/MM/AAAA` (Intl) |
| Statut | `<StatusBadge>` avec libellé français coloré |
| Actions | Lien "Voir" + bouton "Supprimer" (brouillon uniquement) |

État vide : message + lien vers le catalogue.  
État d'erreur : bandeau rouge avec `role="alert"`.

---

## Tests

### Backend — `tests/unit/test_dossiers.py`

5 nouveaux tests ajoutés (groupe `US-04-01`) :

| Test | Scénario |
|------|----------|
| `test_list_my_dossiers_returns_vehicle_info` | Vérifie que make/model/year sont dans la réponse |
| `test_list_my_dossiers_returns_only_own_dossiers` | Isolation entre clients |
| `test_list_my_dossiers_empty_for_new_client` | Liste vide → tableau vide |
| `test_list_my_dossiers_ordered_most_recent_first` | Ordre décroissant par date |
| `test_list_my_dossiers_requires_authentication` | 401 sans cookie |

Résultat : **6/6 passed** (incluant le test de tri existant).

### Frontend — `tests/components/StatusBadge.test.tsx`

4 tests couvrant le nouveau composant :

| Test | Scénario |
|------|----------|
| `it.each` (×6 statuts) | Libellé français correct pour chaque statut |
| `expose un rôle status accessible` | `role="status"` présent |
| `l'aria-label contient le libellé lisible` | Accessibilité ARIA |
| `couleur de fond différente selon le statut` | Styles distincts par statut |

### Frontend — `tests/app/mes-dossiers-page.test.tsx`

Fichier entièrement reécrit, **25 tests** :

- Affichage référence, véhicule, badge statut, type, date
- Lien "Voir" présent pour chaque dossier
- Bouton "Supprimer" conditionnel (brouillon uniquement)
- Suppression et retrait de la liste
- État vide avec lien catalogue
- Gestion d'erreur API (`role="alert"`)
- Respect de `NEXT_PUBLIC_API_URL`

Résultat : **25/25 passed**.

---

## Fichiers modifiés / créés

```
backend/
  app/schemas/dossier.py                        ← modifié
  app/api/v1/endpoints/dossiers.py              ← modifié
  tests/unit/test_dossiers.py                   ← modifié (+5 tests)

frontend/
  src/types/index.ts                            ← modifié (+4 types)
  src/components/StatusBadge.tsx                ← créé
  src/app/mes-dossiers/page.tsx                 ← refactorisé
  tests/components/StatusBadge.test.tsx         ← créé
  tests/app/mes-dossiers-page.test.tsx          ← réécrit (25 tests)

docs/
  US-04-01-tableau-de-bord-client.md            ← créé (ce fichier)
```