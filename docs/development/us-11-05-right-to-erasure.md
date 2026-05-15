# US-11-05 — Droit à l'effacement (RGPD)

## Objectif

Permettre au **client** d'exercer son **droit à l'effacement** depuis l'espace client, avec traitement **compatible obligations légales** (soft delete, délais de réponse, conservation puis purge).

## Parcours utilisateur

1. Connexion au site (cookie JWT).
2. Ouverture du profil (page ou modale depuis la navbar).
3. Section **« Données personnelles (RGPD) »** (visible uniquement pour le rôle `client`).
4. Clic sur **« Demander la suppression de mes données »** puis confirmation dans la boîte de dialogue du navigateur.
5. Le compte est **désactivé** immédiatement (`is_active = false`, `deleted_at` renseigné) : **soft delete**.
6. Un **email de confirmation** est envoyé (via Resend si configuré) rappelant le **délai maximal de 30 jours** pour la réponse réglementaire au sens du RGPD, ainsi que la coexistence avec les **durées légales de conservation** avant purge définitive ou anonymisation.
7. Le cookie de session est **supprimé** (déconnexion).

## Implémentation technique

| Élément | Détail |
|--------|--------|
| API | `POST /api/v1/auth/request-data-erasure` (cookie requis) |
| Rôle | Réservé au rôle **`client`** (403 pour les autres) |
| Soft delete | `users.deleted_at` + `is_active = false`, jetons email / reset effacés |
| Email | `send_data_erasure_confirmation_email` dans `app/services/emailing.py` |
| Audit | Action `CLIENT_DATA_ERASURE_REQUESTED` (`app/services/audit.py`) |
| Purge différée | `app/services/data_retention.py` : `hard_delete_expired_soft_deleted_clients_without_dossiers` + variable `CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS` (défaut indicatif, à valider avec le DPO) |

## Conservation légale et purge physique

- Les durées exactes (comptabilité, contentieux, preuve contractuelle, etc.) sont **fixées par la loi** et consignées dans le **registre des traitements** ; le code expose un rappel des catégories dans `legal_retention_categories()`.
- La fonction de **purge physique** ne supprime que les comptes **sans dossier** lié, au-delà du seuil `CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS`, afin d'éviter les ruptures de clés étrangères. Les comptes avec dossiers doivent être traités par un **processus métier** (anonymisation des dossiers, archivage légal, etc.) défini avec le DPO.
- Exécution recommandée : **tâche planifiée** (cron, Celery, job Kubernetes) appelant périodiquement `hard_delete_expired_soft_deleted_clients_without_dossiers`.

## Fichiers principaux

- `backend/app/api/v1/endpoints/auth.py` — endpoint et constante `RGPD_DATA_ERASURE_RESPONSE_DAYS = 30`
- `backend/app/services/emailing.py` — modèle d'email HTML
- `backend/app/services/data_retention.py` — politique et purge
- `backend/app/core/config.py` — `CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS`
- `frontend/src/app/espace-client/ProfileManagementClient.tsx` — UI espace client
- `backend/tests/unit/test_us_11_05_right_to_erasure.py` — tests automatisés

## Variables d'environnement

- `CLIENT_ACCOUNT_HARD_PURGE_AFTER_DAYS` — nombre de jours après `deleted_at` avant suppression définitive des comptes éligibles (défaut **2555** ; à ajuster selon validation juridique).
