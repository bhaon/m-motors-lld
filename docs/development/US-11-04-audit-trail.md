# US-11-04 — Audit Trail : traçabilité des mutations sensibles

## Objectif

Toutes les actions sensibles (mutations d'entités critiques) sont enregistrées de manière immuable dans une table `audit_trail`, afin de satisfaire aux obligations légales de traçabilité.

---

## Table `audit_trail`

| Colonne | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Identifiant auto-incrémenté |
| `created_at` | DATETIME TZ | Horodatage UTC de l'action |
| `action` | VARCHAR(64) | Code de l'action (voir liste ci-dessous) |
| `entity_type` | VARCHAR(64) | Type d'entité concernée (`user`, `vehicle`, `dossier`) |
| `entity_id` | INTEGER | Identifiant de l'entité |
| `operator_id` | INTEGER | ID de l'utilisateur ayant exécuté l'action |
| `operator_email` | VARCHAR(255) | Email de l'opérateur (dénormalisé pour l'historique) |
| `operator_role` | VARCHAR(32) | Rôle de l'opérateur au moment de l'action |
| `ip_address` | VARCHAR(45) | Adresse IP source (IPv4 ou IPv6, nullable) |
| `before_state` | JSON | État de l'entité avant la mutation (null pour créations) |
| `after_state` | JSON | État de l'entité après la mutation |

### Index définis

- `ix_audit_trail_action` — recherche par type d'action
- `ix_audit_trail_entity_type` — filtrage par type d'entité
- `ix_audit_trail_entity_id` — historique d'une entité
- `ix_audit_trail_operator_id` — actions d'un opérateur
- `ix_audit_trail_created_at` — plage temporelle (tri, rétention)

---

## Actions tracées

| Code | Endpoint | Description |
|---|---|---|
| `USER_CREATED` | `POST /api/v1/admin/users` | Création d'un compte par un admin |
| `USER_DELETED` | `DELETE /api/v1/admin/users/{id}` | Soft-delete d'un utilisateur |
| `USER_ROLE_CHANGED` | `PATCH /api/v1/admin/users/{id}/role` | Modification du rôle |
| `VEHICLE_CREATED` | `POST /api/v1/vehicules` et `/vehicules/creer` | Ajout d'un véhicule au catalogue |
| `VEHICLE_UPDATED` | `PATCH /api/v1/vehicules/{id}` | Modification d'un véhicule |
| `VEHICLE_ARCHIVED` | `DELETE /api/v1/vehicules/{id}` | Archivage (soft delete) |
| `DOSSIER_SUBMITTED` | `POST /api/v1/dossiers/{id}/submit` | Soumission d'un dossier client |

---

## Propriété append-only

La table `audit_trail` est en **écriture seule** :

- Aucun endpoint `PATCH`, `PUT` ou `DELETE` n'est exposé pour cette ressource.
- Le seul endpoint disponible est `GET /api/v1/admin/audit-trail` (lecture, admin uniquement).

### Renforcement au niveau base de données (PostgreSQL production)

Appliquer après la migration :

```sql
CREATE RULE no_update_audit
    AS ON UPDATE TO audit_trail DO INSTEAD NOTHING;

CREATE RULE no_delete_audit
    AS ON DELETE TO audit_trail DO INSTEAD NOTHING;
```

> Ces règles ne s'appliquent pas à SQLite (environnement de test). L'immuabilité en test repose uniquement sur l'absence d'endpoints de mutation.

---

## Atomicité

Chaque mutation métier et son entrée d'audit sont **dans la même transaction** : si la mutation échoue (exception, rollback), l'entrée d'audit n'est pas persistée.

```python
# Exemple dans admin.py
db.add(user)
db.flush()                # Assigne user.id sans committer
audit_service.record(db, ...) # Ajoute l'entrée dans la session
db.commit()               # Un seul commit pour les deux
```

---

## Consultation

### Endpoint

```
GET /api/v1/admin/audit-trail
```

**Accès** : administrateurs uniquement (cookie JWT avec rôle `admin`).

**Paramètres de requête** :

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `skip` | int | 0 | Décalage pour la pagination |
| `limit` | int | 50 | Nombre maximum d'entrées (max 200) |
| `action` | string | — | Filtrer par code d'action |
| `entity_type` | string | — | Filtrer par type d'entité |

**Exemple de réponse** :

```json
[
  {
    "id": 42,
    "created_at": "2026-05-08T14:32:10.123456+00:00",
    "action": "USER_CREATED",
    "entity_type": "user",
    "entity_id": 15,
    "operator_id": 1,
    "operator_email": "admin@mmotors.fr",
    "operator_role": "admin",
    "ip_address": "192.168.1.10",
    "before_state": null,
    "after_state": {
      "id": 15,
      "email": "sophie.martin@mmotors.fr",
      "role": "superviseur",
      "first_name": "Sophie",
      "last_name": "Martin",
      "email_verified": true
    }
  }
]
```

---

## Rétention (5 ans minimum)

La politique de rétention exige que les entrées soient conservées **au minimum 5 ans** à compter de leur création.

### Purge planifiée (à implémenter en production)

Un job de nettoyage doit être configuré pour supprimer uniquement les entrées antérieures à la limite légale :

```sql
-- Supprimer les entrées de plus de 5 ans (PostgreSQL)
DELETE FROM audit_trail
WHERE created_at < NOW() - INTERVAL '5 years';
```

Ce job doit être planifié via un scheduler externe (cron Kubernetes, pg_cron, Celery Beat) et **ne jamais supprimer en dessous de 5 ans**.

> La migration `006_us_11_04_audit_trail.py` ne crée pas ce job : il est de la responsabilité de l'équipe infrastructure.

---

## Exemple d'intégration (service)

```python
from app.services import audit as audit_service

audit_service.record(
    db,
    action=audit_service.USER_ROLE_CHANGED,
    entity_type="user",
    entity_id=target.id,
    operator=current_admin,
    ip_address=request.client.host if request.client else None,
    before_state={"role": "superviseur"},
    after_state={"role": "gestionnaire"},
)
db.commit()
```

---

## Tests couverts

| Test | Cas vérifié |
|---|---|
| `test_create_user_generates_audit_entry` | USER_CREATED avec before/after state |
| `test_create_user_audit_contains_operator_info` | Opérateur id/email/rôle dans l'entrée |
| `test_failed_create_user_does_not_generate_audit` | Pas d'entrée si la mutation échoue (409) |
| `test_delete_user_generates_audit_entry` | USER_DELETED avec état avant suppression |
| `test_role_change_generates_audit_entry` | USER_ROLE_CHANGED avec before/after rôle |
| `test_create_vehicle_bearer_generates_audit` | VEHICLE_CREATED via Bearer |
| `test_create_vehicle_cookie_generates_audit` | VEHICLE_CREATED via Cookie |
| `test_update_vehicle_generates_audit_entry` | VEHICLE_UPDATED avec champs modifiés |
| `test_archive_vehicle_generates_audit_entry` | VEHICLE_ARCHIVED avec état archivé |
| `test_submit_dossier_generates_audit_entry` | DOSSIER_SUBMITTED avec transition statut |
| `test_no_update_endpoint_for_audit_trail` | HTTP 405 sur PATCH (append-only) |
| `test_no_delete_endpoint_for_audit_trail` | HTTP 405 sur DELETE (append-only) |
| `test_admin_can_list_audit_trail` | GET retourne la liste avec tous les champs |
| `test_non_admin_cannot_list_audit_trail` | 403 pour un gestionnaire |
| `test_unauthenticated_cannot_list_audit_trail` | 401 sans cookie |
| `test_audit_trail_filter_by_action` | Filtrage par action |
| `test_audit_entry_has_utc_timestamp` | Horodatage UTC timezone-aware |
| `test_audit_entry_atomicity_with_mutation` | Atomicité mutation + audit |
