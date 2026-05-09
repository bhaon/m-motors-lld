# US-05-05 — Gestion des photos d'un véhicule

## Objectif

Permettre au gestionnaire d'enrichir la galerie d'un véhicule en ajoutant, réordonnant, désignant la photo principale et en supprimant des photos, directement depuis le back-office.

---

## Modèle de données

```
VehiclePhoto
  id          INTEGER PK
  vehicle_id  FK → vehicles.id (CASCADE DELETE)
  url         TEXT          URL de l'image (JPG ou PNG)
  is_main     BOOLEAN       true = photo de couverture
  order       INTEGER       position dans la galerie (tri croissant)
```

`Vehicle.img` reflète toujours l'URL de la photo principale (`is_main=True`).

---

## Endpoints

### Lister les photos

```
GET /api/v1/vehicules/{id}/photos
```

Retourne la liste triée par `order` croissant.

**Accès** : gestionnaire, superviseur, admin (Bearer ou Cookie).

### Ajouter des photos

```
POST /api/v1/vehicules/{id}/photos
Content-Type: application/json

{ "urls": ["https://example.com/photo1.jpg", "https://example.com/photo2.png"] }
```

- Formats acceptés : **JPG/JPEG, PNG** (validation de l'extension dans l'URL)
- Limite de taille recommandée : 5 Mo par image (vérification côté stockage)
- Nouvelles photos ajoutées après les existantes (order auto-incrémenté)
- Retourne la liste complète mise à jour (201 Created)

### Désigner la photo principale

```
PATCH /api/v1/vehicules/{id}/photos/{photo_id}/principal
```

- Marque la photo comme `is_main=True`, les autres à `False`
- Met à jour `Vehicle.img` avec l'URL de la photo sélectionnée
- Retourne la liste complète mise à jour

### Réordonner les photos

```
POST /api/v1/vehicules/{id}/photos/reordonner
Content-Type: application/json

{ "photos": [{"id": 3, "order": 1}, {"id": 1, "order": 2}, {"id": 2, "order": 3}] }
```

Applique les nouveaux numéros d'ordre. Retourne la liste triée.

### Supprimer une photo

```
DELETE /api/v1/vehicules/{id}/photos/{photo_id}
```

- `204 No Content` si succès
- Si la photo supprimée est principale et qu'il en reste d'autres → la suivante (par order) devient automatiquement principale
- `400` si tentative de supprimer la seule photo principale

---

## Interface back-office

Le bouton **Photos** (violet) est affiché dans chaque ligne de la vue **Actifs** du dashboard.

Cliquer ouvre un modal dédié :

### Galerie existante

Grille de miniatures avec pour chaque photo :
- Badge **Principale** si c'est la photo de couverture
- Champ numérique **Ordre** modifiable
- Bouton **Définir principale** (masqué si déjà principale)
- Bouton **Supprimer** avec confirmation 2-étapes (Oui / Non)

### Réordonnancement

Dès qu'un champ **Ordre** est modifié, un bouton **Appliquer le nouvel ordre** apparaît.

### Ajout de photos

Zone de texte : une URL par ligne (format JPG ou PNG).  
Cliquer **Ajouter** appelle `POST /photos` et rafraîchit la galerie.

---

## Validation des formats

| Critère | Implémentation |
|---|---|
| Format JPG/PNG | Regex `\.(jpe?g\|png)` sur l'URL (côté API, 422 si invalide) |
| Taille max 5 Mo | Côté stockage/CDN — non vérifiable sur URL seule |
| URL vide | Rejetée (422) |

---

## Tests

### Backend (`tests/unit/test_photos_vehicule.py` — 13 tests)

| Test | Cas vérifié |
|---|---|
| `test_list_photos_returns_ordered_photos` | Tri par order croissant |
| `test_list_photos_empty_when_no_gallery` | Liste vide si pas de galerie |
| `test_non_gestionnaire_cannot_list_photos` | 403 pour un client |
| `test_add_valid_jpg_photo` | Ajout d'une photo JPG valide |
| `test_add_multiple_photos_at_once` | Plusieurs URLs en une requête |
| `test_add_photo_rejects_unsupported_format` | 422 pour .gif |
| `test_add_photos_increments_order` | Order > dernier existant |
| `test_set_main_photo_updates_vehicle_img` | vehicle.img + is_main synchronisés |
| `test_reorder_photos` | Nouveaux ordres appliqués en base |
| `test_delete_non_main_photo` | Suppression photo secondaire |
| `test_delete_main_photo_promotes_next` | Promotion automatique de la suivante |
| `test_cannot_delete_last_main_photo` | 400 si seule photo principale |
| `test_delete_photo_not_found_returns_404` | 404 photo inexistante |

### Frontend (`tests/app/backoffice-vehicules-dashboard.test.tsx` — 5 tests)

| Test | Cas vérifié |
|---|---|
| `affiche un bouton Photos par véhicule actif` | Bouton violet présent |
| `ouvre le modal photos au clic` | Modal avec zone d'ajout |
| `affiche les photos existantes avec leur miniature` | Badge Principale + img |
| `ajouter une URL valide appelle POST /photos` | Appel API vérifié |
| `supprimer une photo demande confirmation puis appelle DELETE` | 2-étapes confirm |
