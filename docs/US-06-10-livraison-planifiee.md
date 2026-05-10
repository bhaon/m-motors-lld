# US-06-10 — Planifier une livraison après signature du contrat

## Objectif

Permettre au **gestionnaire** (également superviseur / admin via les mêmes droits BO) de fixer une **date et heure de livraison** lorsque le dossier est en **attente de livraison**. Le client reçoit un **email** récapitulatif ; le dossier passe en statut **livraison planifiée** ; la **fiche dossier client** affiche le créneau et le lieu.

## Comportement produit

| Élément | Détail |
|--------|--------|
| Bouton « Planifier une livraison » | Visible dans la colonne **Action** du tableau **Dossiers en attente** uniquement si `status === attente_livraison`. |
| Modale | Saisie **date + heure** (champ navigateur `datetime-local`). Lieu fixe communiqué dans l’UI de la modale : **Garage Gaudin**. |
| Email client | Envoyé via le service transactionnel (`send_livraison_planifiee_email`) avec date/heure affichées (libellé **heure de Paris**) et lieu **Garage Gaudin**. Lien vers `/mes-dossiers/{id}`. |
| Statut dossier | `attente_livraison` → `livraison_planifiee`. |
| Fiche client | `GET /api/v1/dossiers/{id}` inclut `livraison: { prevue_at, lieu }` lorsque planifiée. |

## API

- **POST** `/api/v1/dossiers/backoffice/{dossier_id}/planifier-livraison`  
  - Rôle : gestionnaire, superviseur, admin.  
  - Corps : `{ "livraison_prevue_at": "<ISO8601 avec fuseau ou Z>" }`  
  - Règles : dossier en `attente_livraison` ; date **strictement dans le futur** (validation Pydantic).  
  - Réponse : `DossierPlanifierLivraisonOut` (`id`, `reference`, `status`, `livraison_prevue_at`, `livraison_lieu`).

## Données

- Nouveau statut enum : `livraison_planifiee`.  
- Colonne `dossiers.livraison_prevue_at` (`DateTime(timezone=True)`, nullable).  
- Lieu de livraison : constante applicative `Garage Gaudin` (non stockée en base).

## Migration

- **011** `011_us_06_10_livraison` : ajout valeur ENUM PostgreSQL `livraison_planifiee` + colonne `livraison_prevue_at`.  
- Sur SQLite (tests), la colonne est créée par migration ; l’enum est géré côté SQLAlchemy modèle.

## Filtre back-office par défaut

Les statuts par défaut du listing BO incluent désormais aussi `livraison_planifiee` pour le suivi des dossiers déjà planifiés.

## Tests

- Backend : `tests/unit/test_us_06_10_planifier_livraison.py` ; ajustements `test_dossiers_backoffice`, `test_reporting_dossiers_us06`.  
- Frontend : `backoffice-dossiers.test.tsx` (bouton + modale + POST), `mes-dossiers-detail-page.test.tsx` (bloc livraison), `StatusBadge.test.tsx`.

## Audit

Action enregistrée : `DOSSIER_LIVRAISON_PLANIFIEE`.
