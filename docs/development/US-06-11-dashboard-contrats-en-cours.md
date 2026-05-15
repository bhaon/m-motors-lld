# US-06-11 — Tableau de bord des contrats LLD en cours (superviseur)

## Objectif

En tant que **superviseur** (ou administrateur), visualiser tous les **contrats LLD en cours** avec les informations utiles, un **code couleur** par année de location, et recevoir un **email** lorsque la fin de contrat approche à **3 mois** pour tenter de conserver le client.

## Périmètre d’accès

- **Rôles** : `superviseur`, `admin` (comme le reporting US-06-06).
- Les **gestionnaires** reçoivent **403** sur l’API dédiée.

## Contrats affichés

- Type **LLD**, statut **`contrat_en_cours`** (après livraison US-06-09).
- Les contrats dont la date de fin est dépassée sont **clôturés automatiquement** avant la liste (même logique que l’espace client).

## Code couleur (phase de location)

Sur la durée totale du contrat (`duree_mois`, en pratique **36 mois**), divisée en **trois tiers** :

| Phase | Période | Couleur UI |
|-------|---------|------------|
| `year1` | 1ère année | Vert |
| `year2` | 2ème année | Orange |
| `year3` | Dernière année | Rouge |

## Alerte email (≤ 3 mois avant la fin)

- **Déclenchement** : `date_fin - aujourd'hui ≤ 90 jours` et `retention_alert_sent_at` vide.
- **Destinataires** : tous les utilisateurs actifs `superviseur` et `admin`.
- **Idempotence** : une seule alerte par dossier (`retention_alert_sent_at`).
- **Job** : `python -m app.jobs.notify_contracts_ending_soon` (à planifier en CronJob K8s, quotidien).

## API

| Méthode | Route | Description |
|---------|--------|-------------|
| `GET` | `/api/v1/reporting/contrats-en-cours` | JSON `ContratEnCoursListOut` |

Champs principaux par contrat : référence, client, véhicule, dates début/fin, mensualité HT, `location_phase`, `fin_dans_3_mois`, `jours_restants`.

## Interface

- Page : **`/backoffice/contrats-en-cours`**
- Menu utilisateur (superviseur / admin) : **« Contrats en cours »**

## Tests

| Fichier | Contenu |
|---------|---------|
| `backend/tests/unit/test_us_06_11_contrats_en_cours.py` | Phases, RBAC, liste API, job email idempotent |
| `frontend/tests/app/backoffice-contrats-en-cours-page.test.tsx` | Chargement tableau, 403 |

```bash
cd bloc3/m-motors-lld/backend && pytest tests/unit/test_us_06_11_contrats_en_cours.py -q
cd bloc3/m-motors-lld/frontend && npm test -- --testPathPatterns=backoffice-contrats-en-cours-page
```

## Déploiement job (production)

Exemple CronJob (à adapter) :

```yaml
# kubectl apply -f — job quotidien 08:00 UTC
schedule: "0 8 * * *"
command: ["python", "-m", "app.jobs.notify_contracts_ending_soon"]
```

Variables requises : `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_BASE_URL`.
