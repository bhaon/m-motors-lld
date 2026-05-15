# US 03-03 — Validation de complétude du dossier client

## Objectif

En tant que client, je veux que le système valide automatiquement la complétude de mon dossier avant soumission afin d'éviter un rejet pour pièce manquante.

## Implémentation

### Backend

- `GET /api/v1/dossiers/{dossier_id}`
  - Retourne le détail d'un dossier du client connecté.
  - Inclut une checklist de pièces, la liste des pièces manquantes et `can_submit`.
- `POST /api/v1/dossiers/{dossier_id}/submit`
  - Bloque la soumission si des pièces obligatoires sont manquantes.
  - Passe le dossier au statut `depose` si la complétude est validée.
- `GET /api/v1/dossiers/me`
  - Liste les dossiers du client connecté (utilisé par la page "Mes dossiers").

### Frontend

- Menu utilisateur (`Navbar`)
  - Ajout du lien `Mes dossiers` avec icône dossier.
- Page `Mes dossiers`
  - Liste des dossiers créés par l'utilisateur.
  - Chaque dossier est cliquable vers sa fiche détaillée.
- Page `Mes dossiers > détail dossier`
  - Checklist visible en continu.
  - Liste explicite des pièces manquantes.
  - Soumission bloquée si dossier incomplet.
  - Récapitulatif affiché avant confirmation finale de soumission.

## Critères DoD couverts

- Soumission bloquée tant que toutes les pièces obligatoires ne sont pas uploadées.
- Liste des pièces manquantes affichée clairement.
- Checklist de progression visible tout au long du formulaire.
- Récapitulatif présenté avant confirmation finale de soumission.

## Tests associés

### Backend (unit)

Fichier : `backend/tests/unit/test_dossiers.py`

- `test_list_my_dossiers_returns_only_owner_sorted_desc`
- `test_list_my_dossiers_requires_authentication`
- `test_get_dossier_detail_returns_checklist_and_missing_pieces`
- `test_submit_dossier_rejected_when_missing_pieces`
- `test_submit_dossier_sets_status_depose_when_complete`

### Frontend (Jest)

- `frontend/tests/components/Navbar.test.jsx`
  - Vérifie le lien `Mes dossiers` dans le menu utilisateur.
- `frontend/tests/app/mes-dossiers-page.test.tsx`
  - Vérifie l'affichage de la liste, les liens cliquables, les états vide/erreur.
- `frontend/tests/app/mes-dossiers-detail-page.test.tsx`
  - Vérifie checklist, blocage si incomplet, récapitulatif, et soumission finale.
