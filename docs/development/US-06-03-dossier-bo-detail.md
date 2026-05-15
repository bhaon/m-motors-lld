# US-06-03 — Consultation du détail d'un dossier (Gestionnaire)

## Objectif

En tant que gestionnaire, je veux consulter le détail complet d'un dossier incluant toutes les pièces justificatives, afin d'instruire la demande.

## Critères d'acceptation (DoD)

- [x] Affichage des informations client (nom, email)
- [x] Affichage du véhicule concerné (marque, modèle, année)
- [x] Affichage du type de contrat (Achat / LLD)
- [x] Liste des pièces justificatives avec statut (déposée / manquante) et date de dépôt
- [x] Chaque pièce uploadée est consultable directement dans le navigateur via une visionneuse intégrée
- [x] L'historique des actions sur le dossier est visible (changements de statut, opérateur, commentaire)
- [x] Bouton "Prendre en charge" accessible depuis la page de détail (US-06-02)
- [x] Accès restreint aux rôles gestionnaire / superviseur / admin (401/403 sinon)

---

## Architecture

### Backend

#### Nouveaux endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/v1/dossiers/backoffice/{id}` | Détail complet du dossier (gestionnaire) |
| `GET` | `/api/v1/dossiers/backoffice/{id}/pieces/{type}/download-url` | URL pré-signée pour consulter une pièce |

#### Schémas ajoutés (`schemas/dossier.py`)

```python
class PieceBoOut(BaseModel):
    type_piece: PieceType
    uploaded: bool
    filename: str | None
    uploaded_at: datetime | None

class DossierBoDetailOut(BaseModel):
    id: int
    reference: str
    type: DossierTypeEnum
    status: str
    submitted_at: datetime | None
    created_at: datetime | None
    motif_rejet: str | None
    notes_internes: str | None
    vehicle: VehicleSummaryOut
    client: ClientSummaryOut
    pieces: list[PieceBoOut]       # les 5 types obligatoires
    historique: list[HistoriqueItemOut]
```

#### Règles métier

- Seuls les rôles `gestionnaire`, `superviseur`, `admin` peuvent accéder à ces routes.
- Le dossier est chargé sans restriction d'ownership (contrairement aux routes client).
- Toutes les relations (`client`, `vehicle`, `pieces`, `historique`) sont chargées via `joinedload` pour éviter le N+1.
- L'URL pré-signée de la pièce est générée par MinIO/S3 (validité 10 min), comme pour les clients.

### Frontend

#### Nouvelle page

`/backoffice/dossiers/[id]` → `src/app/backoffice/dossiers/[id]/page.tsx`

**Sections :**
1. **En-tête** : référence, badge de statut, badge de type, dates, bouton "Prendre en charge" (si statut = déposé)
2. **Client** (carte) : nom complet, email
3. **Véhicule** (carte) : marque/modèle, année, type de contrat
4. **Pièces justificatives** : liste des 5 types avec compteur X/5, bouton "Consulter" pour chaque pièce uploadée
5. **Historique** : timeline des changements de statut (caché si vide)

#### Visionneuse intégrée

Au clic sur "Consulter" :
1. Fetch `GET /api/v1/dossiers/backoffice/{id}/pieces/{type}/download-url`
2. Ouverture d'une modale `role="dialog"` avec :
   - `<iframe>` pour les fichiers PDF
   - `<img>` pour les fichiers JPEG/PNG
   - Lien de téléchargement pour les autres formats
3. Fermeture via le bouton × ou clic sur l'overlay

#### Lien depuis la liste

Le tableau de bord gestionnaire (`/backoffice/dossiers`) rend la colonne "Référence" cliquable avec un `<Link href="/backoffice/dossiers/{id}">`.

---

## Tests

### Backend (`tests/unit/test_dossier_bo_detail.py`) — 12 tests

| Test | Description |
|------|-------------|
| `test_detail_requires_auth` | 401 sans cookie |
| `test_client_cannot_access_bo_detail` | 403 pour un client |
| `test_detail_not_found` | 404 pour un id inexistant |
| `test_detail_returns_dossier_info` | Vérifie id, reference, status |
| `test_detail_includes_client_info` | Vérifie email, prénom, nom client |
| `test_detail_includes_vehicle_info` | Vérifie make, model, year |
| `test_detail_pieces_has_all_required_types` | Les 5 types obligatoires sont présents |
| `test_detail_pieces_all_not_uploaded_when_no_pieces` | uploaded=false sans pièces |
| `test_detail_includes_historique` | Entrées d'historique exposées |
| `test_detail_type_contrat_lld` | Type LLD bien retourné |
| `test_download_url_*` (4 tests) | Auth, 404 dossier, 404 pièce, URL retournée (monkeypatched S3) |

### Frontend (`tests/app/backoffice-dossier-detail.test.tsx`) — 20 tests

Couvre : rendu initial, informations client/véhicule, 5 pièces, boutons Consulter, visionneuse PDF/image, fermeture modale, historique, prise en charge depuis la page de détail, erreurs API.

---

## Notes techniques

- Le hook `useParams` est mocké dans les tests Jest : `jest.mock("next/navigation", () => ({ useParams: () => ({ id: "42" }) }))`.
- Le composant visionneuse est inline (pas de composant séparé) pour rester dans le scope de la US.
- La visionneuse ne persiste pas l'URL : elle est rafraîchie à chaque ouverture (nouvelle URL pré-signée).
