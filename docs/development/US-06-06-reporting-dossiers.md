# US-06-06 — Reporting synthétique des dossiers (superviseur)

## Objectif

En tant que **superviseur** (ou administrateur), accéder à un **reporting synthétique** des dossiers pour piloter l’activité : volumes par statut, taux de validation, délai moyen de traitement, filtrage par période et export CSV.

## Périmètre d’accès

- **Rôles** : `superviseur`, `admin` (identique à `GET /reporting/summary`).
- Les **gestionnaires** ne peuvent pas appeler ces endpoints (403).

## Définitions métier

### Cohorte

Les indicateurs portent sur les dossiers ayant une date de **dépôt** (`submitted_at`) dans l’intervalle **[period_start, period_end_exclusive)** en **UTC** :

- **Semaine** : semaine ISO courante (lundi 00:00 UTC → lundi suivant 00:00 UTC).
- **Mois** : mois civil courant.
- **Trimestre** : trimestre civil courant (jan–mar, avr–jun, etc.).

Les dossiers encore en **brouillon** (sans `submitted_at`) sont exclus de cette cohorte.

### Volume par statut (`by_status`)

Répartition **à l’instant T** des dossiers de la cohorte selon leur **statut courant** en base.

### Taux de validation (`validation_rate`)

\[
\frac{\text{dossiers validés}}{\text{dossiers validés} + \text{dossiers rejetés}}
\]

sur la même cohorte. Si aucun dossier soldé (validé + rejeté = 0), la valeur est `null`.

### Délai moyen de traitement (`avg_processing_days`)

Moyenne des durées **dépôt → décision** (en jours), pour les dossiers de la cohorte au statut **validé** (avec `validated_at`) ou **rejeté** (avec `rejected_at`). Si aucune durée calculable, `null`.

## API

| Méthode | Route | Description |
|---------|--------|---------------|
| `GET` | `/api/v1/reporting/dossiers?period=week\|month\|quarter` | JSON `DossierReportingOut` |
| `GET` | `/api/v1/reporting/dossiers/export.csv?period=…` | CSV UTF-8 avec BOM (Excel / LibreOffice) |

Réponse JSON principale : `period`, `period_start`, `period_end_exclusive`, `cohort_count`, `by_status`, `validation_rate`, `avg_processing_days`.

## Interface

- Page : **`/backoffice/reporting`**
- Menu utilisateur : lien **« Reporting dossiers »** (superviseur et admin, section back-office).
- Sélecteur **Semaine / Mois / Trimestre**, cartes indicateurs, tableau des statuts, bouton **Exporter CSV**.

## Tests

| Fichier | Contenu |
|---------|---------|
| `backend/tests/unit/test_reporting_dossiers_us06.py` | RBAC, structure JSON, agrégats, export CSV, taux null |
| `frontend/tests/app/backoffice-reporting-page.test.tsx` | Chargement, changement de période, 403, export |

```bash
cd bloc3/m-motors-lld/backend && pytest tests/unit/test_reporting_dossiers_us06.py -q
cd bloc3/m-motors-lld/frontend && npm test -- --testPathPatterns=backoffice-reporting-page
```
