"""Métriques HTTP au format Prometheus pour l'US-08-03 (latence, débit, codes HTTP).

Les **traces** et **logs OTLP** restent gérés par OpenTelemetry dans ``app.telemetry`` :
ce module complète la stack par des séries Prometheus standard (histogrammes), idéales
pour Grafana et les ``PrometheusRule`` (p95, taux d'erreur).
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

_CONFIGURED = False


def _enabled() -> bool:
    return os.environ.get("PROMETHEUS_METRICS_ENABLED", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def configure_prometheus_metrics(app: "FastAPI") -> None:
    """
    Enregistre l'instrumentation Prometheus (histogramme ``http_request_duration_seconds``,
    compteur ``http_requests_total``) et expose ``GET /metrics`` (scrape cluster uniquement).
    """
    global _CONFIGURED
    if _CONFIGURED or not _enabled():
        return
    _CONFIGURED = True

    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=False,
        should_respect_env_var=False,
        excluded_handlers=[
            "/metrics",
            "/api/health",
            "/api/healthz",
            "/api/readyz",
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
        ],
    ).instrument(app).expose(app, include_in_schema=False, endpoint="/metrics")


def shutdown_metrics() -> None:
    """Réservé pour symétrie avec ``shutdown_opentelemetry`` (instrumentator sans état global)."""
    return
