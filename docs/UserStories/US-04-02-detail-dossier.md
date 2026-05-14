# US-04-02 — Consultation du détail d'un dossier avec historique

**En tant que** client, **je veux** consulter le détail d'un dossier avec son historique complet **afin de** comprendre où en est ma demande.

---

## Critères d'acceptation (DoD)

| # | Critère | Statut |
|---|---------|--------|
| 1 | La page détail affiche : informations du véhicule, type de contrat, pièces déposées, statut actuel | ✅ |
| 2 | Un historique chronologique des changements de statut est affiché | ✅ |
| 3 | Le motif de rejet est visible si le dossier a été refusé | ✅ |
| 4 | Les documents uploadés sont téléchargeables par le client | ✅ |

---

## Architecture des changements

```
┌─ Backend ──────────────────────────────────────────────────────┐
│  services/object_storage.py  : generate_download_url()         │
│  schemas/dossier.py          : HistoriqueItemOut               │
│                              + PieceDownloadUrlOut             │
│                              + DossierPieceChecklistItemOut     │
│                                  (+ filename)                  │
│                              + DossierDetailOut                 │
│                                  (+ vehicle, historique,        │
│                                     motif_rejet)               │
│  endpoints/dossiers.py       : GET /{id}  (joinedload vehicle  │
│                                            + historique)       │
│                              + GET /{id}/pieces/{type}/download-url │
└────────────────────────────────────────────────────────────────┘
              │  JSON enrichi
              ▼
┌─ Frontend ─────────────────────────────────────────────────────┐
│  app/mes-dossiers/[id]/page.tsx  : 3 nouvelles sections        │
│    1. En-tête : véhicule + statut badge + motif rejet          │
│    2. Checklist : filename + bouton Télécharger par pièce      │
│    3. Historique : timeline avec StatusBadge + commentaires    │
└────────────────────────────────────────────────────────────────┘
```

---

## Détail des modifications

### Backend

#### `app/services/object_storage.py` — `generate_download_url()`

Nouvelle fonction qui génère une URL pré-signée GET valable 10 minutes (paramètre `S3_PRESIGN_EXPIRES_SECONDS`) :

```python
def generate_download_url(client, *, object_key: str, filename: str) -> str:
    # ...
    return presign_client.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": object_key,
            "ResponseContentDisposition": f'attachment; filename="{safe_name}"',
        },
        ExpiresIn=settings.S3_PRESIGN_EXPIRES_SECONDS,
    )
```

L'en-tête `Content-Disposition: attachment` force le téléchargement du fichier côté navigateur.

#### `app/schemas/dossier.py` — Nouveaux schémas

```python
class HistoriqueItemOut(BaseModel):
    ancien_status: str | None = None
    nouveau_status: str
    commentaire: str | None = None
    created_at: datetime

class PieceDownloadUrlOut(BaseModel):
    download_url: str   # URL pré-signée GET (10 min)
    filename: str       # Nom original du fichier

class DossierPieceChecklistItemOut(BaseModel):
    type_piece: PieceType
    uploaded: bool
    filename: str | None = None  # ← nouveau champ (None si non uploadée)
```

`DossierDetailOut` enrichi :

```python
class DossierDetailOut(BaseModel):
    # ... champs existants ...
    motif_rejet: str | None = None          # ← nouveau
    vehicle: VehicleSummaryOut | None = None # ← nouveau
    historique: list[HistoriqueItemOut] = [] # ← nouveau
```

#### `app/api/v1/endpoints/dossiers.py`

**`GET /api/v1/dossiers/{id}`** — mise à jour :
- `joinedload(Dossier.vehicle)` + `joinedload(Dossier.historique)` pour éviter N+1 queries
- Popule `motif_rejet`, `vehicle`, `historique`
- `_build_piece_checklist` enrichi : récupère `filename` pour chaque pièce uploadée

**`GET /api/v1/dossiers/{id}/pieces/{type_piece}/download-url`** — nouveau endpoint :
- Vérifie la propriété du dossier (401/404 sinon)
- Cherche la `PieceJustificative` correspondante (404 si absente)
- Génère et retourne une URL pré-signée GET

Exemple de réponse :

```json
{
  "download_url": "https://minio.example.com/mmotors-documents/dossiers/1/cni/20260507-cni.pdf?X-Amz-...",
  "filename": "cni.pdf"
}
```

---

### Frontend

#### `app/mes-dossiers/[id]/page.tsx` — Refonte complète

**Nouvelles interfaces TypeScript :**

```typescript
interface HistoriqueItem {
  ancien_status: string | null;
  nouveau_status: string;
  commentaire: string | null;
  created_at: string;
}

interface DossierVehicle {
  make: string; model: string; year: number;
}

interface ChecklistItem {
  type_piece: PieceType;
  uploaded: boolean;
  filename?: string | null;   // ← nouveau
}

interface DossierDetail {
  // ... champs existants ...
  motif_rejet?: string | null;        // ← nouveau
  vehicle?: DossierVehicle | null;    // ← nouveau
  historique?: HistoriqueItem[];      // ← nouveau
}
```

**Nouvelle fonction `downloadPiece(type)`** :

```typescript
async function downloadPiece(type: PieceType) {
  const response = await fetch(resolveDownloadUrl(params.id, type), {
    credentials: "include",
  });
  const { download_url } = await response.json();
  window.open(download_url, "_blank", "noopener,noreferrer");
}
```

**Trois sections visuelles :**

| Section | Contenu |
|---------|---------|
| **En-tête dossier** | Référence + `StatusBadge`, véhicule (marque/modèle/année), type/dates, encart motif rejet si statut `rejete` |
| **Pièces justificatives** | Checklist avec filename + bouton "Télécharger" (pièces uploadées) + input d'upload |
| **Historique du dossier** | Timeline `<ol>` avec `StatusBadge` ancien → nouveau + date + commentaire |

---

## Tests

### Backend — `tests/unit/test_dossiers.py`

8 nouveaux tests (groupe US-04-02) :

| Test | Scénario |
|------|----------|
| `test_get_dossier_detail_includes_vehicle_info` | make/model/year dans la réponse |
| `test_get_dossier_detail_includes_empty_historique` | `historique: []` pour un nouveau dossier |
| `test_get_dossier_detail_includes_motif_rejet_null_by_default` | `motif_rejet: null` si non rejeté |
| `test_get_dossier_detail_checklist_includes_filename_when_uploaded` | filename présent si pièce uploadée |
| `test_download_url_returns_presigned_url` | URL pré-signée + filename retournés |
| `test_download_url_returns_404_when_piece_missing` | 404 si pièce non uploadée |
| `test_download_url_rejects_non_owner` | 404 si dossier appartient à un autre client |

Résultat : **8/8 passed**.

### Frontend — `tests/app/mes-dossiers-detail-page.test.tsx`

Réécriture complète, **24 tests** :

**Nouveaux tests US-04-02 :**

| Test | Scénario |
|------|----------|
| Véhicule | Affiche marque, modèle, année |
| Type de contrat | Affiche "LLD" ou "Achat" |
| Badge statut | Affiche "Brouillon" via `StatusBadge` |
| Motif de rejet visible | Encart affiché si `status="rejete"` + motif |
| Motif de rejet absent | Zone non rendue si dossier non rejeté |
| Boutons Télécharger | 5 boutons présents si 5 pièces uploadées |
| Pas de télécharger | Aucun bouton si aucune pièce uploadée |
| Appel endpoint download-url | Appel correct + `window.open` avec l'URL |
| Erreur téléchargement | Affiche `role="alert"` si le backend échoue |
| Nom de fichier affiché | `filename` visible sous le libellé de la pièce |
| Historique affiché | `<ol aria-label>` + 3 items si 3 entrées |
| Historique absent | Section non rendue si liste vide |
| Badges dans l'historique | `StatusBadge` ancien → nouveau présents |

Résultat : **24/24 passed**.

---

## Fichiers modifiés / créés

```
backend/
  app/services/object_storage.py              ← modifié (+generate_download_url)
  app/schemas/dossier.py                      ← modifié (+3 schémas, champs enrichis)
  app/api/v1/endpoints/dossiers.py            ← modifié (GET /{id} + GET /pieces/{type}/download-url)
  tests/unit/test_dossiers.py                 ← modifié (+8 tests)

frontend/
  src/app/mes-dossiers/[id]/page.tsx          ← refactorisé complet
  tests/app/mes-dossiers-detail-page.test.tsx ← réécrit (24 tests)

docs/
  US-04-02-detail-dossier.md                 ← créé (ce fichier)
```
