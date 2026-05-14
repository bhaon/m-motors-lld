# US-05-03 — Bascule Achat ↔ LLD

## Objectif

Permettre au gestionnaire de basculer un véhicule du mode **Vente (Achat)** vers le mode **Location Longue Durée (LLD)** et inversement, directement depuis le dashboard back-office, avec protection contre les modifications accidentelles lorsque des dossiers sont en cours.

---

## Endpoint

```
POST /api/v1/vehicules/{vehicle_id}/toggle-lld
```

**Accès** : gestionnaire, superviseur, admin (Bearer **ou** Cookie JWT).

### Paramètre de requête

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `confirm` | bool | `false` | Forcer la bascule même si des dossiers actifs existent |

### Réponse `ToggleLldOut`

```json
{
  "vehicle": { "id": 1, "lld": true, "mensualite": null, ... },
  "toggled": true,
  "warning": null,
  "active_dossiers_count": 0
}
```

| Champ | Description |
|---|---|
| `vehicle` | État du véhicule après la bascule (ou état inchangé si `toggled=false`) |
| `toggled` | `true` si la bascule a été effectuée, `false` si une confirmation est requise |
| `warning` | Message d'avertissement quand `toggled=false` |
| `active_dossiers_count` | Nombre de dossiers en cours (déposé/en instruction) |

---

## Comportement

### Cas nominal (aucun dossier actif)

```
POST /api/v1/vehicules/42/toggle-lld
→ 200 { "toggled": true, "vehicle": { "lld": true }, ... }
```

### Véhicule avec dossiers actifs — sans confirmation

```
POST /api/v1/vehicules/42/toggle-lld
→ 200 {
    "toggled": false,
    "warning": "Ce véhicule a 2 dossiers actifs (déposé/en instruction). Ajoutez ?confirm=true pour forcer la bascule.",
    "active_dossiers_count": 2,
    "vehicle": { "lld": false, ... }   ← inchangé
  }
```

### Véhicule avec dossiers actifs — avec confirmation explicite

```
POST /api/v1/vehicules/42/toggle-lld?confirm=true
→ 200 { "toggled": true, "vehicle": { "lld": true }, ... }
```

**Dossiers actifs** = statuts `depose` et `en_instruction`. Les statuts terminaux (`valide`, `rejete`, `annule`) ne déclenchent pas d'avertissement.

### Bascule LLD → Achat

Lorsque le mode passe de LLD à Achat, `mensualite` est remis à `null` automatiquement.

---

## Audit trail

Chaque bascule réussie (`toggled=true`) génère une entrée `VEHICLE_LLD_TOGGLED` dans l'audit trail :

```json
{
  "action": "VEHICLE_LLD_TOGGLED",
  "entity_type": "vehicle",
  "entity_id": 42,
  "operator_id": 3,
  "operator_email": "gest@mmotors.fr",
  "operator_role": "gestionnaire",
  "ip_address": "192.168.1.5",
  "before_state": { "lld": false, "mensualite": null },
  "after_state":  { "lld": true,  "mensualite": null },
  "created_at": "2026-05-08T14:32:10.123456+00:00"
}
```

Une bascule non effectuée (warning sans confirmation) **ne génère pas** d'entrée dans l'audit trail.

---

## Interface back-office (dashboard)

Le bouton de bascule est affiché dans chaque ligne du tableau `/backoffice/vehicules` :

| État du véhicule | Bouton affiché |
|---|---|
| Achat | `→ LLD` |
| LLD | `→ Vente` |

### Flux sans dossiers actifs

1. Clic sur `→ LLD` (ou `→ Vente`)
2. Appel API → `toggled=true`
3. Badge et mensualité mis à jour immédiatement dans la liste
4. Toast de confirmation affiché

### Flux avec dossiers actifs

1. Clic sur le bouton de bascule
2. Appel API → `toggled=false`, avertissement retourné
3. Affichage inline dans la ligne : `⚠ X dossier(s) actif(s)` + boutons **Basculer quand même** / **Annuler**
4. Si confirmation : appel API avec `?confirm=true` → `toggled=true`
5. Si annulation : retour à l'état initial de la ligne

---

## Tests

### Backend (`tests/unit/test_toggle_lld.py` — 11 tests)

| Test | Cas vérifié |
|---|---|
| `test_toggle_achat_to_lld` | Achat → LLD, toggled=True, lld=True |
| `test_toggle_lld_to_achat` | LLD → Achat, lld=False, mensualite=None |
| `test_toggle_nonexistent_vehicle_returns_404` | 404 pour id inexistant |
| `test_non_gestionnaire_cannot_toggle` | 403 pour un client |
| `test_toggle_returns_warning_when_active_dossiers_without_confirm` | Avertissement sans confirm, véhicule inchangé |
| `test_toggle_with_confirm_overrides_warning` | Bascule forcée avec confirm=true |
| `test_toggle_no_warning_for_terminal_dossiers` | Valide/Rejeté ne bloquent pas |
| `test_toggle_warning_counts_only_active_statuses` | Seuls déposé/en_instruction comptent |
| `test_toggle_generates_audit_entry` | Entrée VEHICLE_LLD_TOGGLED créée avec before/after |
| `test_toggle_no_audit_when_warning_not_confirmed` | Pas d'audit si toggled=False |

### Frontend (`tests/app/backoffice-vehicules-dashboard.test.tsx` — 5 tests)

| Test | Cas vérifié |
|---|---|
| `affiche un bouton de bascule pour chaque véhicule` | Boutons `→ LLD` et `→ Vente` présents |
| `bascule immédiatement le mode si aucun dossier actif` | Toast de succès affiché |
| `affiche un avertissement si des dossiers actifs existent` | Boutons Confirmer/Annuler affichés |
| `appelle toggle avec ?confirm=true après confirmation` | URL avec `confirm=true` vérifiée |
| `annule l'avertissement de bascule avec le bouton Annuler` | Retour au bouton de bascule initial |
