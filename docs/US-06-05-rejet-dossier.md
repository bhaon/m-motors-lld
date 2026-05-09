# US-06-05 — Rejet d’un dossier avec motif obligatoire

## Objectif

En tant que gestionnaire, rejeter un dossier avec un **motif obligatoire** afin d’informer le client des raisons du refus.

## Implémentation

### API

| Élément | Détail |
|--------|--------|
| Endpoint | `PATCH /api/v1/dossiers/{dossier_id}/rejeter` |
| Corps JSON | `{ "motif": "<texte>" }` |
| Authentification | Cookie JWT |
| Rôles | `gestionnaire`, `superviseur`, `admin` |

**Motif**

- Après trim : **minimum 20 caractères**, maximum **4000**.
- Validation Pydantic (`DossierRejeterIn`) : réponse **422** si les contraintes ne sont pas respectées.

**Règles métier**

- Transitions autorisées vers `rejete` depuis **`depose`** ou **`en_instruction`** uniquement.
- Statuts `brouillon`, `valide`, `annule` ou autre → **409**.
- Si le dossier est **déjà** `rejete`, la réponse est **200** (idempotent) : pas de nouvelle ligne d’historique, pas d’audit ni d’email dupliqués.

**Effets du rejet**

1. `status` = `rejete`, `motif_rejet` = motif (trim), `rejected_at` = instant UTC.
2. Entrée dans `dossier_historique` avec opérateur et motif dans le commentaire.
3. Audit **`DOSSIER_REJETE`** (`operator_*`, `created_at`, états avant/après incluant le motif).
4. Email au client via `_notify_status_change` avec **`motif_rejet`** (bloc déjà prévu dans le HTML emailing pour le statut rejeté).

### Espace client

Le endpoint existant `GET /api/v1/dossiers/{id}` (client propriétaire) expose déjà **`motif_rejet`** ; la page **Mes dossiers — détail** affiche le bloc « Motif de rejet » lorsque le statut est `rejete`.

### Back-office

- **Fiche dossier** : bouton **« Rejeter le dossier »** si statut `depose` ou `en_instruction`.
- **Modale** `DossierRejectModal` : zone de texte, compteur minimum 20 caractères, bouton « Confirmer le rejet » désactivé tant que la contrainte n’est pas remplie.
- Réponse API : champ **`rejected_at`** également renvoyé sur **`GET …/backoffice/{id}`**.

## Tests

| Fichier | Couverture |
|---------|------------|
| `backend/tests/unit/test_rejeter_dossier.py` | Auth, RBAC, 422, transitions, audit, email, idempotence, visibilité client, BO |
| `frontend/tests/app/backoffice-dossier-detail.test.tsx` | Bouton, modale, validation locale, appel API |
| `frontend/tests/components/DossierRejectModal.test.tsx` | Confirmation désactivée si motif trop court |

## Commandes utiles

```bash
cd bloc3/m-motors-lld/backend && pytest tests/unit/test_rejeter_dossier.py -q
cd bloc3/m-motors-lld/frontend && npm test -- --testPathPatterns=DossierRejectModal --testPathPatterns=backoffice-dossier-detail
```
