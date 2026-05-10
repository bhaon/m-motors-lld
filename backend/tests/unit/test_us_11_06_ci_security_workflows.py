"""Tests de conformité des workflows CI/CD — US-11-06 (SAST SonarQube, DAST OWASP ZAP)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, cast

import yaml

# Racine du dépôt (backend/tests/unit → ../../../../)
REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_workflow(name: str) -> Mapping[Any, Any]:
    """Charge un fichier workflow GitHub Actions en YAML."""
    path = REPO_ROOT / ".github" / "workflows" / name
    text = path.read_text(encoding="utf-8")
    data = yaml.safe_load(text)
    return cast(Mapping[Any, Any], data)


def _workflow_triggers(wf: Mapping[Any, Any]) -> Mapping[Any, Any]:
    """Retourne le bloc `on` ; PyYAML 1.1 peut mapper la clé `on` au booléen True."""
    if "on" in wf:
        return cast(Mapping[Any, Any], wf["on"])
    return cast(Mapping[Any, Any], wf.get(True, {}))


def test_sonarqube_pr_workflow_existe_et_contient_sonar_scan() -> None:
    """Le workflow PR déclenche SonarQube avec historique Git complet."""
    data = _load_workflow("sonarqube-pr.yaml")
    assert data.get("name")
    assert "pull_request" in _workflow_triggers(data)
    jobs = data.get("jobs", {})
    assert "sonarqube" in jobs
    steps = jobs["sonarqube"].get("steps", [])
    kinds = [s.get("uses") for s in steps if isinstance(s, dict)]
    assert any(s and "SonarSource/sonarqube-scan-action" in s for s in kinds)
    checkout: dict[str, Any] = next(
        (s for s in steps if isinstance(s, dict) and s.get("uses") == "actions/checkout@v5"),
        {},
    )
    assert checkout.get("with", {}).get("fetch-depth") == 0


def test_deploy_staging_contient_zap_et_rapport_securite() -> None:
    """Le déploiement staging exécute OWASP ZAP et archive un rapport sécurité."""
    data = _load_workflow("deploy-staging.yaml")
    deploy_body = yaml.dump(data["jobs"]["deploy"], allow_unicode=True)
    assert "zaproxy/action-baseline" in deploy_body
    assert "STAGING_DAST_TARGET" in deploy_body
    assert "security-report-staging" in deploy_body
    assert "-l WARN" in deploy_body or "cmd_options" in deploy_body


def test_sonar_project_properties_couverture_referencee() -> None:
    """sonar-project.properties référence les rapports de couverture frontend/backend."""
    props = (REPO_ROOT / "sonar-project.properties").read_text(encoding="utf-8")
    assert "sonar.projectKey=" in props
    assert "sonar.javascript.lcov.reportPaths=frontend/coverage/lcov.info" in props
    assert "sonar.python.coverage.reportPaths=backend/coverage.xml" in props
