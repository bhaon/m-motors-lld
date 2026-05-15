# US-06-04 — Validation d’un dossier par le gestionnaire

## Objectif

En tant que gestionnaire, valider un dossier pour confirmer l’accord de l’entreprise et déclencher la suite du processus.

## Implémentation

### API

| Élément | Détail |
|--------|--------|
| Endpoint | `PATCH /api/v1/dossiers/{dossier_id}/valider` |
| Authentification | Cookie JWT |
| Rôles autorisés | `gestionnaire`, `superviseur`, `admin` |

**Règles métier**

- Transition autorisée : `en_instruction` → `valide`.
- En cas de dossier déjà au statut `valide`, la réponse est **200** (idempotent) : aucune nouvelle ligne d’historique, aucune entrée d’audit dupliquée, aucun email supplémentaire.
- Tout autre statut source → **409 Conflict**.

**Effets de la validation**

1. `dossiers.status` = `valide`.
2. `dossiers.validated_at` = horodatage UTC au moment de la validation.
3. Ligne dans `dossier_historique` (ancien / nouveau statut, commentaire avec nom et email du gestionnaire, `operateur_id`).
4. Entrée **append-only** dans `audit_trail` avec l’action `DOSSIER_VALIDE`, l’opérateur (id, email, rôle) et un horodatage sur l’entrée d’audit.
5. Email au client via `send_status_change_email` (même mécanisme que la prise en charge et la soumission). L’envoi est déclenché juste après le commit ; la livraison effective dépend du fournisseur (Resend), ce qui respecte en pratique une **notification dans les 5 minutes** au sens métier (délai opérationnel habituel).

### Détail back-office

Le endpoint `GET /api/v1/dossiers/backoffice/{id}` expose désormais **`validated_at`** pour affichage sur la fiche dossier.

### Frontend

- Page : `frontend/src/app/backoffice/dossiers/[id]/page.tsx`
- Bouton **« Valider le dossier »** visible uniquement si `status === "en_instruction"`.
- Après succès : mise à jour locale du statut et de `validated_at`, toast de confirmation.
- Affichage de la ligne **« Validé le : … »** lorsque `validated_at` est renseigné.

## Tests

| Fichier | Couverture |
|---------|------------|
| `backend/tests/unit/test_valider_dossier.py` | Auth, RBAC, 404, transition, `validated_at`, historique, audit, email, 409, idempotence, champ BO |
| `frontend/tests/app/backoffice-dossier-detail.test.tsx` | Bouton, absence selon statut, appel `PATCH …/valider`, toast, affichage date |

## Commandes utiles

```bash
# Backend (depuis bloc3/m-motors-lld/backend)
pytest tests/unit/test_valider_dossier.py -q

# Frontend (depuis bloc3/m-motors-lld/frontend)
npm test -- --testPathPatterns=backoffice-dossier-detail
```
