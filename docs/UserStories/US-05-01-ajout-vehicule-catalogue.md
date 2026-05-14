# US 05-01 — Ajout d'un véhicule au catalogue

## Objectif

En tant que gestionnaire, ajouter un nouveau véhicule au catalogue afin de le rendre disponible à la vente ou à la location.

## Implémentation

### Backend

#### Nouveau endpoint — `POST /api/v1/vehicules/creer` (cookie auth)

Endpoint dédié au formulaire gestionnaire, utilisant l'authentification cookie (cohérent avec l'architecture client-facing) plutôt que Bearer.

**Accès** : gestionnaire, superviseur, admin (403 pour client).

**Comportement** :
- Valide le payload via `VehicleCreate`
- Crée le véhicule en base
- Enregistre les photos additionnelles (`VehiclePhoto`) si `photos_urls` est fourni
- Retourne `VehicleCreateOut` : `{ id, reference, message }`

```python
POST /api/v1/vehicules/creer
→ 201 { "id": 42, "reference": "VEH-00042", "message": "Véhicule ajouté au catalogue avec succès." }
→ 401 sans cookie
→ 403 rôle insuffisant ou JWT incohérent
→ 422 validation (LLD sans mensualité, photo vide)
```

L'endpoint existant `POST /api/v1/vehicules` (Bearer auth) est conservé sans modification pour les clients API / tests.

#### Schémas mis à jour — `app/schemas/vehicle.py`

**`VehicleCreate`** — 2 ajouts :
- `photos_urls: list[str] | None = None` — URLs de photos additionnelles
- `@field_validator("img")` — lève 422 si `img` est vide ou contient uniquement des espaces (DoD : photo principale obligatoire)

**`VehicleCreateOut`** (nouveau) — réponse de confirmation :
```python
class VehicleCreateOut(BaseModel):
    id: int
    reference: str   # "VEH-00042"
    message: str     # confirmation lisible
```

### Frontend

#### Page formulaire — `src/app/backoffice/vehicules/nouveau/page.tsx`

Page `"use client"` accessible sur `/backoffice/vehicules/nouveau`.

**Sections du formulaire** :

| Section | Champs |
|---------|--------|
| Identité | Marque *, Modèle *, Année * (2000-2030), Motorisation *, Kilométrage *, Couleur *, Boîte *, Puissance *, Nombre de places |
| Tarification | Prix de vente HT * (€), Type de contrat (Achat / LLD), Mensualité LLD HT * (€/mois) — visible si LLD sélectionné |
| Photo | URL photo principale * (champ `type="url"` + aperçu live) |
| Publication | Visible dans le catalogue (case cochée par défaut) |

**Validation côté client** (avant envoi) :
- Champs obligatoires non vides
- Année entre 2000 et 2030
- Prix et kilométrage positifs
- Mensualité requise et positive si LLD sélectionné
- URL photo principale non vide

**Message de confirmation** après création réussie :
```
✅ Véhicule ajouté au catalogue avec succès.
Référence : VEH-00042   [Voir la fiche →]
```

Le formulaire est **réinitialisé** après confirmation.

#### Navbar — `src/components/Navbar.tsx`

- `role` ajouté au state (extrait du `/api/v1/auth/me`)
- Lien "**Ajouter un véhicule**" (avec icône +) visible dans le menu dropdown uniquement pour les rôles gestionnaire, superviseur, admin
- `GESTIONNAIRE_ROLES = new Set(["gestionnaire", "superviseur", "admin"])`

## Critères DoD couverts

| Critère | Implémentation |
|---------|----------------|
| Formulaire de saisie complet | ✅ 9 champs obligatoires + type contrat + mensualité conditionnelle |
| Au moins une photo obligatoire | ✅ `@field_validator("img")` + validation frontend + aperçu live |
| Statut En vente / En location | ✅ Champ radio Achat/LLD → `vehicle.lld = true/false` |
| Message de confirmation | ✅ Bannière verte avec référence et lien fiche |

## Tests associés

### Backend — `backend/tests/unit/test_vehicles.py` (10 nouveaux tests)

- `test_creer_vehicule_achat_retourne_confirmation` — 201 + id/référence/message
- `test_creer_vehicule_lld_avec_mensualite` — LLD créé avec `lld=true` et mensualite en base
- `test_creer_vehicule_lld_sans_mensualite_rejete` — 422 si LLD sans mensualité
- `test_creer_vehicule_photo_vide_rejete` — 422 si `img=""` (photo obligatoire)
- `test_creer_vehicule_client_refuse` — 403 pour un client
- `test_creer_vehicule_non_authentifie_refuse` — 401 sans cookie
- `test_creer_vehicule_superviseur_autorise` — 201 pour superviseur
- `test_creer_vehicule_visible_catalogue_par_defaut` — `visible_catalogue=True` par défaut
- `test_creer_vehicule_non_visible_catalogue` — `visible_catalogue=False` respecté
- `test_creer_vehicule_jwt_role_mismatch_rejete` — 403 JWT rôle gonflé (défense profondeur)

### Frontend — `frontend/tests/app/backoffice-vehicule-nouveau.test.tsx` (18 tests)

- Titre et affichage des champs obligatoires
- Sélecteur Achat/LLD et apparition conditionnelle mensualité
- Bouton soumission + lien Annuler
- Validation : formulaire vide → erreurs ; LLD sans mensualité → erreur ; fetch non appelé si invalide
- Soumission réussie : fetch appelé avec `credentials: include`, message de confirmation, référence, reset formulaire
- Payload LLD : `lld=true` + `mensualite` dans le body
- Erreur API (role="alert") + erreur réseau
- `NEXT_PUBLIC_API_URL` préfixe l'URL
