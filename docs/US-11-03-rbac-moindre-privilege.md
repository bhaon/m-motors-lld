# US 11-03 — RBAC : principe du moindre privilège

## Objectif

En tant qu'administrateur, gérer les accès selon le principe du moindre privilège (RBAC) afin de limiter les droits aux besoins stricts de chaque rôle.

## Architecture RBAC

### Matrice des droits

| Endpoint | Client | Gestionnaire | Superviseur | Admin |
|----------|:------:|:------------:|:-----------:|:-----:|
| `GET /dossiers/me` | ✅ (ses dossiers uniquement) | — | — | — |
| `GET /dossiers/{id}` | ✅ (propriétaire uniquement) | — | — | — |
| `POST /dossiers/{id}/submit` | ✅ | — | — | — |
| `GET /dossiers/backoffice` | ❌ 403 | ✅ | ✅ | ✅ |
| `GET /reporting/summary` | ❌ 403 | ❌ 403 | ✅ | ✅ |
| `GET /admin/users` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ |
| `PATCH /admin/users/{id}/role` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ |
| `GET /vehicules` (catalogue) | ✅ | ✅ | ✅ | ✅ |
| `POST /vehicules` (back-office) | ❌ 403 | ✅ | ✅ | ✅ |

### Hiérarchie des rôles

```
admin  ⊃  superviseur  ⊃  gestionnaire  ⊃  client
```

L'inclusion est implémentée via `require_role(*roles)` dans `deps.py` :
- `require_gestionnaire` → gestionnaire, superviseur, admin
- `require_superviseur` → superviseur, admin
- `require_admin` → admin uniquement

## Implémentation

### `app/core/deps.py` — deux nouvelles fonctions

**`get_user_from_cookie(access_token, db)`** : résout l'utilisateur depuis le cookie JWT **et** vérifie la cohérence du claim `role` JWT contre le rôle en base.

```python
# Défense en profondeur : le claim rôle dans le JWT doit correspondre au rôle en base.
if role_claim is not None and role_claim != user.role.value:
    raise HTTPException(status_code=403, detail="Rôle JWT incohérent avec le rôle en base.")
```

Scénario protégé : un token signé avant une révocation de privilège est rejeté dès le premier appel.

**`enforce_role(user, *allowed_roles)`** : lève 403 si le rôle de l'utilisateur n'est pas dans les rôles autorisés. Utilisé directement dans les endpoints après résolution de l'utilisateur.

**Nouveaux types annotés** : `SuperviseurUser`, `AdminUser` (complémentent `GestionnaireUser` existant).

### `app/api/v1/endpoints/dossiers.py` — mise à jour

`_resolve_user_from_cookie` délègue désormais à `get_user_from_cookie` :
- Tous les endpoints dossiers héritent automatiquement de la vérification du claim rôle
- `GET /dossiers/backoffice` ajouté — liste tous les dossiers (pas seulement les siens) pour gestionnaire+

### `app/api/v1/endpoints/reporting.py` (nouveau)

`GET /api/v1/reporting/summary` — superviseur et admin uniquement.

Retourne :
```json
{
  "total_dossiers": 42,
  "by_status": {"brouillon": 10, "depose": 15, "valide": 17},
  "by_type": {"achat": 25, "lld": 17},
  "total_clients": 38
}
```

Le gestionnaire **ne peut pas** accéder à cet endpoint (403). C'est la distinction clé entre les rôles gestionnaire et superviseur.

### `app/api/v1/endpoints/admin.py` (nouveau)

`GET /api/v1/admin/users` — liste tous les utilisateurs (admin uniquement).

`PATCH /api/v1/admin/users/{id}/role` — modifie le rôle d'un utilisateur.

Règles de sécurité :
- Admin uniquement (403 pour tous les autres rôles)
- L'admin ne peut pas modifier son propre rôle (400)
- Retourne 404 si l'utilisateur cible est inconnu

### `app/schemas/admin.py` (nouveau)

Schemas Pydantic pour les réponses back-office :
- `UserAdminOut` : profil utilisateur (id, email, role, is_active, email_verified)
- `RoleChangeIn` / `RoleChangeOut` : payload et confirmation de changement de rôle
- `ReportingSummaryOut` : tableau de bord statistiques

## Critères DoD couverts

| Critère | Implémentation |
|---------|----------------|
| 4 rôles définis : Client, Gestionnaire, Superviseur, Administrateur | `RoleEnum` (pré-existant) + `SuperviseurUser`, `AdminUser` ajoutés |
| Chaque endpoint API vérifie le rôle via le JWT | `get_user_from_cookie` vérifie le claim `role` contre la DB sur tous les endpoints cookie |
| Un Client ne peut accéder qu'à ses propres données | `Dossier.client_id == user.id` sur `/me` et `/{id}` ; `/backoffice` réservé gestionnaire+ |
| Un Gestionnaire ne peut pas accéder au reporting réservé au Superviseur | `enforce_role(user, RoleEnum.superviseur, RoleEnum.admin)` sur `/reporting/summary` |

## Tests associés — `backend/tests/unit/test_rbac.py` (21 tests)

### Back-office dossiers
- `test_client_cannot_access_dossier_backoffice` — 403 pour client
- `test_gestionnaire_can_access_dossier_backoffice` — 200
- `test_superviseur_can_access_dossier_backoffice` — 200 (par héritage)
- `test_admin_can_access_dossier_backoffice` — 200
- `test_backoffice_returns_all_clients_dossiers` — vérifie que tous les dossiers sont retournés
- `test_client_can_only_access_own_dossiers_via_me` — isolation par client confirmée

### Reporting
- `test_unauthenticated_cannot_access_reporting` — 401 sans cookie
- `test_client_cannot_access_reporting` — 403
- `test_gestionnaire_cannot_access_reporting` — **403** (distinction gestionnaire / superviseur)
- `test_superviseur_can_access_reporting_summary` — 200 + vérification des champs
- `test_admin_can_access_reporting_summary` — 200
- `test_reporting_summary_counts_are_accurate` — compteurs cohérents avec la base

### Administration
- `test_client_cannot_access_admin_users` — 403
- `test_gestionnaire_cannot_access_admin_users` — 403
- `test_superviseur_cannot_access_admin_users` — 403
- `test_admin_can_list_users` — 200 + liste utilisateurs
- `test_admin_can_change_user_role` — 200 + vérification en base
- `test_admin_cannot_change_own_role` — 400
- `test_admin_role_change_returns_404_for_unknown_user` — 404

### Défense en profondeur JWT
- `test_jwt_role_claim_mismatch_is_rejected` — **403** : JWT signé valide mais rôle gonflé rejeté
- `test_jwt_matching_role_is_accepted` — 200 : JWT cohérent accepté normalement
