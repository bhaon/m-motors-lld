# US-11-06 — Analyse SAST et DAST dans le pipeline CI/CD

En tant que responsable sécurité, l’objectif est de détecter les vulnérabilités **avant** la mise en production grâce à l’analyse statique (SAST) sur chaque PR et à l’analyse dynamique (DAST) sur l’environnement de **staging**.

## Synthèse des garde-fous

| Exigence | Implémentation |
|----------|------------------|
| SonarQube à chaque PR | Workflow [`.github/workflows/sonarqube-pr.yaml`](../../.github/workflows/sonarqube-pr.yaml) |
| OWASP ZAP sur staging avant validation du déploiement | Étape ZAP dans [`.github/workflows/deploy-staging.yaml`](../../.github/workflows/deploy-staging.yaml) après smoke tests |
| Vulnérabilités critiques → blocage | **Sonar** : Quality Gate (à configurer côté Sonar pour traiter les sévérités *Blocker* / *Critical* comme échec). **ZAP** : seuil **`-l WARN`** (niveaux acceptés par Baseline : `PASS` … `FAIL`, pas `HIGH` — voir ci-dessous). |
| Rapport archivé à chaque cycle | Artefacts `security-report-sast-pr-*` (PR) et `security-report-staging-*` + `zap-dast-staging-*` (staging) |

## Configuration SonarCloud / SonarQube (SAST)

1. Créer un projet sur [SonarCloud](https://sonarcloud.io) (ou utiliser une instance SonarQube interne).
2. Renseigner les secrets et variables du dépôt GitHub :
   - **Secret** `SONAR_TOKEN` : token d’analyse généré dans SonarCloud / SonarQube.
   - **Variable** `SONAR_ORGANIZATION` : clé d’organisation SonarCloud (ex. `mon-org-github`).
3. Vérifier que la clé de projet dans [`sonar-project.properties`](../../sonar-project.properties) (`sonar.projectKey`) correspond au projet côté Sonar.
4. Dans l’interface Sonar, configurer la **Quality Gate** pour faire échouer l’analyse si des problèmes **Critical** / **Blocker** de sécurité sont présents (alignement avec la définition de « vulnérabilité critique » métier).

Les PR depuis forks du dépôt ne exécutent pas le job Sonar (`if: github.event.pull_request.head.repo.full_name == github.repository`) afin d’éviter l’exposition de secrets.

## OWASP ZAP (DAST) sur staging

Le workflow **Deploy → STAGING** appelle le scan **Baseline** après les smoke tests HTTP, contre l’URL définie par `STAGING_DAST_TARGET` (par défaut `https://staging.netdevops.fr`, surcharge possible via la variable dépôt `STAGING_DAST_TARGET`).

- **Blocage** : `fail_action: true` et **`-l WARN`** — le script Baseline classe les findings en `PASS` / `IGNORE` / `INFO` / `WARN` / `FAIL` (depuis les versions récentes de `zap-baseline.py`). **`HIGH` n’est plus une valeur valide pour `-l`** : elle provoquait une erreur d’options puis **code de sortie 3** (« any other failure », souvent confondu avec un bug Docker). Pour ne bloquer que les règles marquées `FAIL` dans la config, utilisez **`-l FAIL`**.
- **Rapports** : l’action attache un artefact nommé `zap-dast-staging-<run_id>` ; un fichier Markdown `security-report-dast-staging.md` est également produit et conservé 90 jours.

Pour ignorer des alertes connues sans les masquer côté CI, vous pouvez ajouter un fichier `.zap/rules.tsv` et la propriété `rules_file_name` dans l’étape ZAP (voir [documentation ZAP Baseline](https://www.zaproxy.org/docs/docker/baseline-scan/)).

## Tests automatisés

Les tests [`backend/tests/unit/test_us_11_06_ci_security_workflows.py`](../../backend/tests/unit/test_us_11_06_ci_security_workflows.py) vérifient que les workflows et `sonar-project.properties` restent conformes à cette user story.

```bash
cd backend && pytest tests/unit/test_us_11_06_ci_security_workflows.py -v
```

## Liens utiles

- [SonarSource GitHub Action](https://github.com/SonarSource/sonarqube-scan-action)
- [OWASP ZAP Baseline Action](https://github.com/zaproxy/action-baseline)
