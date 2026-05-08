# US 04-04 — Historique des contrats LLD

## Objectif

En tant que client, consulter l'historique de mes contrats actifs afin de gérer mes engagements Location Longue Durée (LLD) en cours.

## Implémentation

### Backend

#### Modèle — `app/models/dossier.py`

Deux colonnes ajoutées à la table `dossiers` :

| Colonne | Type | Description |
|---------|------|-------------|
| `duree_mois` | `Integer` nullable | Durée du contrat LLD en mois |
| `date_debut_contrat` | `Date` nullable | Date de début effective du contrat |

La **date de fin** est calculée dynamiquement (`date_debut_contrat + duree_mois mois`), sans colonne dédiée en base, pour éviter la désynchronisation.

#### Migration — `alembic/versions/005_us_04_04_lld_contrats.py`

Migration idempotente avec `_has_column` : ajoute les deux colonnes si elles n'existent pas. Compatible SQLite (mode `batch`) et PostgreSQL.

#### Schemas — `app/schemas/dossier.py`

**`ContratVehicleOut`** : résumé du véhicule pour un contrat.
```python
class ContratVehicleOut(BaseModel):
    make: str
    model: str
    year: int
    mensualite: float | None = None
```

**`ContratListItemOut`** : contrat LLD validé retourné à l'espace client.
```python
class ContratListItemOut(BaseModel):
    id: int
    reference: str
    vehicle_id: int
    vehicle: ContratVehicleOut
    duree_mois: int | None = None
    date_debut: date | None = None
    date_fin: date | None = None     # calculé, non stocké
    is_active: bool                  # True si date_fin >= aujourd'hui ou non définie
```

#### Endpoint — `GET /api/v1/dossiers/contrats`

Retourne tous les dossiers LLD au statut `valide` du client connecté.

**Filtre :** `type=lld AND status=valide AND client_id=user.id`

**Tri :** actifs en premier, puis terminés ; au sein de chaque groupe par date de début décroissante.

**Calcul `is_active` :**
```python
date_fin = date_debut + duree_mois mois   # helper _add_months()
is_active = date_fin is None or date_fin >= date.today()
```

**`_add_months(d, months)`** : helper respectant les fins de mois (ex. 31 janvier + 1 mois = 28 février).

L'endpoint est enregistré **avant** `/{dossier_id}` dans le router pour éviter les conflits de routing FastAPI.

### Frontend

#### Types — `src/types/index.ts`

```typescript
export interface ContratVehicle {
  make: string;
  model: string;
  year: number;
  mensualite: number | null;
}

export interface ContratListItem {
  id: number;
  reference: string;
  vehicle_id: number;
  vehicle: ContratVehicle;
  duree_mois: number | null;
  date_debut: string | null;
  date_fin: string | null;
  is_active: boolean;
}
```

#### Page — `src/app/mes-contrats/page.tsx`

Page client `"use client"` accessible sur `/mes-contrats`.

**Structure :**
- Titre « Mes contrats LLD »
- Tableau responsive : Référence (lien vers dossier), Véhicule, Durée, Mensualité, Date de début, Fin prévue, Statut
- Ligne des contrats terminés affichée en opacité réduite (0.7)
- **`ActiveBadge`** : badge inline `role="status"` — vert « Actif » / gris « Terminé »
- **État vide** : message + lien vers le catalogue LLD
- **État erreur** : `role="alert"` avec le message de l'API
- Mensualité formatée avec `Intl.NumberFormat` en euros (fr-FR)
- Dates formatées avec `Intl.DateTimeFormat` (dd/mm/yyyy)

#### Navbar — `src/components/Navbar.tsx`

Ajout du lien « Mes contrats » avec icône SVG dans le menu utilisateur dropdown, entre « Mes dossiers » et « Déconnexion ».

## Critères DoD couverts

| Critère | Statut |
|---------|--------|
| Les contrats LLD validés sont accessibles dans l'espace client | ✅ Endpoint `GET /contrats` + page `/mes-contrats` |
| Chaque contrat affiche référence, véhicule, durée, mensualité, date de début | ✅ Table avec toutes les colonnes |
| Les contrats terminés sont archivés et consultables | ✅ `is_active=False` + badge « Terminé » + même liste |

## Tests associés

### Backend — `backend/tests/unit/test_dossiers.py` (9 nouveaux tests)

- `test_list_contrats_returns_only_lld_valide_dossiers` — filtre type=lld et status=valide
- `test_list_contrats_returns_only_own_contracts` — isolation par client
- `test_list_contrats_requires_authentication` — 401 sans cookie
- `test_list_contrats_empty_for_client_without_validated_lld` — liste vide
- `test_list_contrats_includes_vehicle_info_and_mensualite` — données véhicule + prix
- `test_list_contrats_computes_date_fin_from_duree_mois` — calcul date_fin
- `test_list_contrats_is_active_true_when_date_fin_in_future` — is_active=True
- `test_list_contrats_is_active_false_when_date_fin_in_past` — is_active=False
- `test_list_contrats_active_sorted_before_terminated` — tri actifs → terminés

### Frontend — `frontend/tests/app/mes-contrats-page.test.tsx` (16 tests)

- Titre de la page
- Appel endpoint `/api/v1/dossiers/contrats` avec `credentials: include`
- Référence avec lien vers `/mes-dossiers/{id}`
- Véhicule (make, model, année)
- Durée en mois
- Mensualité formatée
- Badge « Actif » + aria-label accessible
- Badge « Terminé » pour contrat archivé
- Affichage simultané actif + terminé
- État vide + lien catalogue
- Erreur API (role="alert")
- Erreur réseau
- Contrat sans date/durée (tirets)
- `NEXT_PUBLIC_API_URL` préfixe l'URL correctement
