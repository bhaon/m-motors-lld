# US-06-07 — Contrat et signature électronique après validation du dossier

## Objectif

Après validation par le gestionnaire, le dossier passe en **« en signature »**, un **contrat** est généré à partir du gabarit `backend/app/templates/contrat.md`, le client est notifié par **e-mail** et peut **consulter** le contrat dans son espace, **initier la signature** (modale + e-mail de lien magique), puis finaliser la signature ; le dossier passe en **« attente de livraison »**.

## Statuts dossier

| Statut (API)        | Libellé UI             |
|---------------------|------------------------|
| `en_signature`      | En signature           |
| `attente_livraison` | Attente de livraison   |

Le statut `valide` peut encore apparaître sur d’anciennes données ; la validation métier actuelle crée désormais `en_signature` et le contrat associé.

## Backend

- **Modèle** `DossierContrat` (`dossier_contrats`) : `reference`, `body_markdown`, jeton de signature (hash SHA-256, expiration), `signed_at`.
- **Validation** `PATCH /api/v1/dossiers/{id}/valider` : génère le contrat, statut → `en_signature`, e-mail « Contrat à signer » avec lien `…/mes-dossiers/{id}#contrat`.
- **Consultation** `GET /api/v1/dossiers/{id}/contrat` : markdown ; **réservé au client** propriétaire (sinon 404).
- **Demande de signature** `POST /api/v1/dossiers/{id}/contrat/demander-signature` : corps `{ "accepte": true }` ; envoie l’e-mail avec le lien de confirmation.
- **Confirmation** `GET /api/v1/auth/confirm-contract-signature?token=…` : même principe que `confirm-email` ; enregistre la signature, statut → `attente_livraison`, journal historique + audit `CONTRAT_SIGNE_ELECTRONIQUEMENT`.
- **Listing contrats LLD** `GET /api/v1/dossiers/contrats` : inclut les dossiers `valide` (legacy) et `attente_livraison`.
- **Reporting** : les taux de validation comptent `valide`, `en_signature` et `attente_livraison` comme issues positives vs `rejete`.

## Frontend

- Page dossier `mes-dossiers/[id]` : bloc **Contrat** (id `contrat` pour l’ancre e-mail), aperçu markdown, bouton **Signer le contrat** si `contrat.can_sign`, **modale** de confirmation puis POST `demander-signature`.
- Page publique `confirm-contract-signature` : appelle l’API de confirmation comme la page `confirm-email`.

## Migration base

- Révision Alembic `009_us_06_07` : table `dossier_contrats`.

## Tests

- `tests/unit/test_us_06_07_contract_signature.py` : flux complet.
- `tests/unit/test_valider_dossier.py` : validation → `en_signature` + contrat en base.
