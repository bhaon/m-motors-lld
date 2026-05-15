# US-05-04 — Archivage véhicule (soft delete)

## Objectif

Permettre au gestionnaire de retirer un véhicule du catalogue **sans le supprimer définitivement** (soft delete). Le véhicule reste en base et peut être consulté ou restauré depuis le back-office.

---

## Comportement

| Opération | Résultat en base | Front-office | Back-office |
|---|---|---|---|
| Archivage | `archived=True`, `archived_at=now()`, `visible_catalogue=False` | Invisible | Visible dans l'onglet **Archivés** |
| Restauration | `archived=False`, `archived_at=None`, `visible_catalogue=True` | Visible | Réapparaît dans l'onglet **Actifs** |

---

## Endpoints

### Archivage

```
DELETE /api/v1/vehicules/{vehicle_id}
```

**Accès** : gestionnaire, superviseur, admin (Bearer **ou** Cookie).  
**Réponse** : `204 No Content`.

Le véhicule est marqué `archived=True` — il **reste en base de données**.

### Liste back-office (filtre)

```
GET /api/v1/vehicules/backoffice?archived=false   ← actifs (défaut)
GET /api/v1/vehicules/backoffice?archived=true    ← archivés
```

**Accès** : gestionnaire, superviseur, admin (Cookie).

La réponse inclut les champs `archived` et `archived_at` dans chaque objet `VehicleBoOut`.

### Restauration

```
POST /api/v1/vehicules/{vehicle_id}/restaurer
```

**Accès** : gestionnaire, superviseur, admin (Bearer **ou** Cookie).  
**Réponse** : `200 VehicleBoOut` — le véhicule restauré.

Retourne `404` si le véhicule n'existe pas ou n'est pas archivé.

---

## Schéma `VehicleBoOut` (champs ajoutés)

| Champ | Type | Description |
|---|---|---|
| `visible_catalogue` | bool | Visible dans le catalogue public |
| `archived` | bool | `true` si archivé |
| `archived_at` | datetime \| null | Date d'archivage (UTC) |

---

## Audit trail

| Action | Déclencheur | before_state | after_state |
|---|---|---|---|
| `VEHICLE_ARCHIVED` | DELETE /{id} | `{id, make, model, archived: false}` | `{archived: true, archived_at, visible_catalogue: false}` |
| `VEHICLE_RESTORED` | POST /{id}/restaurer | `{id, make, model, archived: true, archived_at}` | `{archived: false, visible_catalogue: true}` |

---

## Interface back-office (dashboard)

Le dashboard `/backoffice/vehicules` propose deux onglets :

```
[ Actifs ]   [ Archivés ]
```

### Onglet Actifs (défaut)
- Tableau habituel avec boutons Basculer / Modifier / Supprimer
- Cliquer **Supprimer** archive le véhicule (confirmation 2 étapes)

### Onglet Archivés
- Tableau en lecture seule : photo, marque/modèle, type, prix, date d'archivage
- Bouton **Restaurer** par ligne → appelle `POST /restaurer`
- Aucun bouton d'édition/suppression (véhicule déjà retiré)

---

## Tests

### Backend (`tests/unit/test_archivage_vehicule.py` — 10 tests)

| Test | Cas vérifié |
|---|---|
| `test_archive_vehicle_soft_deletes_in_db` | archived=True, archived_at non null, reste en base |
| `test_archived_vehicle_excluded_from_public_catalogue` | Invisible dans GET /vehicules |
| `test_archive_generates_audit_entry` | VEHICLE_ARCHIVED dans l'audit trail |
| `test_backoffice_default_excludes_archived` | GET /backoffice ne retourne pas les archivés |
| `test_backoffice_archived_filter_returns_only_archived` | GET /backoffice?archived=true filtre |
| `test_backoffice_archived_response_includes_archived_at` | Champs archived et archived_at présents |
| `test_restore_vehicle_unarchives_in_db` | archived=False, archived_at=None, visible=True |
| `test_restore_nonexistent_archived_returns_404` | 404 si véhicule actif ou inexistant |
| `test_restore_generates_audit_entry` | VEHICLE_RESTORED dans l'audit trail |
| `test_non_gestionnaire_cannot_restore` | 403 pour un client |

### Frontend (`tests/app/backoffice-vehicules-dashboard.test.tsx` — 5 tests)

| Test | Cas vérifié |
|---|---|
| `affiche les onglets Actifs et Archivés` | Deux boutons présents |
| `l'onglet Actifs est sélectionné par défaut` | aria-pressed=true sur Actifs |
| `cliquer sur Archivés appelle l'API avec ?archived=true` | URL vérifiée |
| `affiche le bouton Restaurer pour chaque véhicule archivé` | Bouton accessible |
| `restaurer un véhicule le retire de la liste archivée` | DELETE optimiste + appel API |
