# US-06-02 — Prise en charge d'un dossier

## Objectif

Permettre au gestionnaire de **prendre en charge un dossier déposé** afin de signaler qu'il est en cours de traitement, d'enregistrer son identité comme instructeur et de tracer l'action dans l'audit trail.

---

## Critères d'acceptation (DoD)

| Critère | Implémentation |
|---|---|
| Bouton "Prendre en charge" sur la liste des dossiers | Colonne "Action" — visible uniquement pour les dossiers au statut `depose` |
| Le statut passe à `en_instruction` | `dossier.status = DossierStatusEnum.en_instruction` |
| Le gestionnaire assigné est enregistré | `dossier.gestionnaire_id = user.id` |
| L'action est tracée dans l'audit trail | Entrée `DOSSIER_PRIS_EN_CHARGE` dans `AuditTrail` |

---

## Endpoint API

```
PATCH /api/v1/dossiers/{dossier_id}/prendre-en-charge
```

**Accès** : gestionnaire, superviseur, admin (Cookie JWT).

### Règles métier

| Statut initial | Résultat |
|---|---|
| `depose` | ✅ Prise en charge → `en_instruction` |
| `en_instruction` (même gestionnaire) | ✅ Idempotent — pas de doublon en historique |
| `en_instruction` (autre gestionnaire) | ✅ Réassignation avec nouvelle entrée historique |
| `brouillon`, `valide`, `rejete`, `annule` | ❌ 409 Conflict |

### Réponse `200 OK`

```json
{
  "id": 12,
  "reference": "DOS-2026-00012",
  "status": "en_instruction",
  "gestionnaire_id": 7
}
```

### Erreurs

| Code | Cause |
|---|---|
| `401` | Cookie absent ou expiré |
| `403` | Rôle insuffisant (client) |
| `404` | Dossier introuvable |
| `409` | Statut incompatible (brouillon, valide, rejeté, annulé) |

---

## Effets en base

### `dossiers`
- `status` → `en_instruction`
- `gestionnaire_id` → id du gestionnaire connecté

### `dossier_historique` (nouvelle entrée)
```
ancien_status  = "depose"
nouveau_status = "en_instruction"
commentaire    = "Pris en charge par Prénom Nom (email@example.com)"
operateur_id   = gestionnaire.id
```

### `audit_trail` (nouvelle entrée)
```
action       = "DOSSIER_PRIS_EN_CHARGE"
entity_type  = "dossier"
entity_id    = dossier.id
before_state = { "status": "depose", "gestionnaire_id": null }
after_state  = { "status": "en_instruction", "gestionnaire_id": 7, "gestionnaire_email": "…" }
```

---

## Interface front-office

La colonne **Action** est ajoutée au tableau de la page `/backoffice/dossiers` (US-06-01).

- Bouton bleu-vert **"Prendre en charge"** visible uniquement pour les dossiers `depose`.
- Pendant la requête : bouton grisé avec indicateur `…`.
- Succès : mise à jour optimiste du statut dans la ligne (→ "En instruction"), le bouton disparaît, un **toast** confirme l'action.
- Erreur : message d'erreur inline `role="alert"`.

---

## Architecture

```
backend/
  app/schemas/dossier.py                  ← DossierPrendreEnChargeOut
  app/services/audit.py                   ← DOSSIER_PRIS_EN_CHARGE
  app/api/v1/endpoints/dossiers.py        ← PATCH /{id}/prendre-en-charge
  tests/unit/test_prise_en_charge.py

frontend/
  src/app/backoffice/dossiers/page.tsx    ← bouton + handlePrendreEnCharge
  tests/app/backoffice-dossiers.test.tsx  ← describe "prise en charge (US-06-02)"
```

---

## Tests

### Backend (12 cas)

```bash
python3 -m pytest /path/to/backend/tests/unit/test_prise_en_charge.py -v
```

Couvre : accès (401/403/404), changement de statut, enregistrement gestionnaire_id,
création historique, création audit trail, refus statut incompatible (brouillon/valide/rejeté),
idempotence (même gestionnaire), réassignation (autre gestionnaire).

### Frontend (6 cas supplémentaires)

```bash
npx jest tests/app/backoffice-dossiers.test.tsx
```

Couvre : présence bouton sur statut `depose`, absence sur `en_instruction`,
appel PATCH, mise à jour optimiste du statut, toast de confirmation, affichage erreur 409.
