"""OpenTelemetry : traces (FastAPI, SQLAlchemy, httpx), logs OTLP et corrélation trace/span."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.engine import Engine

_CONFIGURED = False


def _sdk_disabled() -> bool:
    """Indique si l'initialisation OTel doit être ignorée (tests, désactivation explicite)."""
    return os.environ.get("OTEL_SDK_DISABLED", "").strip().lower() in ("1", "true", "yes")


def _trace_endpoint_configured() -> bool:
    """Vrai si un export OTLP des traces est probablement voulu."""
    return bool(
        os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
        or os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "").strip()
    )


def _logs_otlp_handler_enabled() -> bool:
    """
    Active l'export OTLP des logs (handler Python) si demandé.

    Utiliser ``OTEL_LOGS_EXPORTER=none`` avec un endpoint traces seul (ex. Jaeger UI)
    pour éviter d'envoyer des logs OTLP vers un backend qui ne les exploite pas.
    Un ``OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`` explicite active toujours l'export.
    """
    if os.environ.get("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "").strip():
        return True
    mode = os.environ.get("OTEL_LOGS_EXPORTER", "otlp").strip().lower()
    if mode in ("none", "false", "0", "off"):
        return False
    return _trace_endpoint_configured() and mode == "otlp"


def _build_resource(service_name: str) -> Resource:
    """Construit la ressource OTel (service.name prioritaire via OTEL_SERVICE_NAME)."""
    name = os.environ.get("OTEL_SERVICE_NAME", "").strip() or service_name
    attrs: dict[str, str] = {"service.name": name}
    version = os.environ.get("OTEL_SERVICE_VERSION", "").strip()
    if version:
        attrs["service.version"] = version
    return Resource.create(attrs)


def _root_log_level() -> int:
    """Niveau du logger racine depuis LOG_LEVEL (INFO par défaut)."""
    return getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)


def shutdown_opentelemetry() -> None:
    """Arrête proprement les exporteurs (flush) à la fin du cycle de vie de l'application."""
    if _sdk_disabled():
        return
    try:
        tp = trace.get_tracer_provider()
        if hasattr(tp, "shutdown"):
            tp.shutdown()  # type: ignore[call-arg]
    except Exception:
        pass
    try:
        from opentelemetry._logs import get_logger_provider

        lp = get_logger_provider()
        if hasattr(lp, "shutdown"):
            lp.shutdown()  # type: ignore[call-arg]
    except Exception:
        pass


def configure_opentelemetry(
    app: "FastAPI",
    *,
    sqlalchemy_engine: "Engine | None" = None,
    service_name: str = "mmotors-api",
    debug: bool = False,
) -> None:
    """
    Initialise les traces, la corrélation des logs et l'export OTLP si configuré.

    Variables utiles : OTEL_SDK_DISABLED, OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME, OTEL_SERVICE_VERSION, LOG_LEVEL, OTEL_LOGS_EXPORTER.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True
    if _sdk_disabled():
        return

    resource = _build_resource(service_name)
    tracer_provider = TracerProvider(resource=resource)

    if _trace_endpoint_configured():
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        endpoint = (
            os.environ.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "").strip()
            or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
        )
        tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint or None)))
        logging.getLogger(__name__).info(
            "OTEL traces OTLP → %s (service.name=%s)",
            endpoint or "default",
            resource.attributes.get("service.name"),
        )
    elif debug:
        tracer_provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(tracer_provider)

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.logging import LoggingInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls=os.environ.get(
            "OTEL_FASTAPI_EXCLUDED_URLS",
            "/api/health,/api/healthz,/api/readyz",
        ),
    )
    if sqlalchemy_engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=sqlalchemy_engine)
    HTTPXClientInstrumentor().instrument()

    LoggingInstrumentor().instrument(
        set_logging_format=True,
        logging_format=(
            "%(asctime)s %(levelname)s [%(name)s] "
            "[trace_id=%(otelTraceID)s span_id=%(otelSpanID)s] %(message)s"
        ),
    )

    root = logging.getLogger()
    root.setLevel(_root_log_level())

    if _logs_otlp_handler_enabled():
        try:
            from opentelemetry._logs import set_logger_provider
            from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
            from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
            from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

            logger_provider = LoggerProvider(resource=resource)
            logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
            set_logger_provider(logger_provider)
            root.addHandler(LoggingHandler(level=logging.NOTSET, logger_provider=logger_provider))
        except Exception as exc:  # pragma: no cover - dépendances / réseau collecteur
            logging.getLogger(__name__).warning("Export OTLP des logs indisponible : %s", exc)
