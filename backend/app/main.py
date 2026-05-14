from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine
from app.prometheus_metrics import configure_prometheus_metrics, shutdown_metrics
from app.telemetry import configure_opentelemetry, shutdown_opentelemetry

# Import all models so Alembic / Base.metadata sees them
import app.models.feature_flag  # noqa
import app.models.lld_option_catalog  # noqa
import app.models.vehicle  # noqa
import app.models.option_lld  # noqa
import app.models.dossier_contract  # noqa
import app.models.lld_avenant  # noqa


@asynccontextmanager
async def lifespan(application: FastAPI):
    """
    Cycle de vie applicatif.

    En Kubernetes, la création/mise à jour du schéma se fait via migrations (initContainer),
    pas via `create_all()` au démarrage de l'API.
    """
    yield
    shutdown_opentelemetry()
    shutdown_metrics()


application = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

application.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

application.include_router(api_router)

configure_opentelemetry(
    application,
    sqlalchemy_engine=engine,
    service_name=settings.APP_NAME,
    debug=settings.DEBUG,
)
configure_prometheus_metrics(application)


@application.get("/api/health", tags=["Health"])
def health() -> dict:
    """Healthcheck simple (pas de dépendance externe)."""
    return {"status": "ok", "version": settings.APP_VERSION}


@application.get("/api/healthz", tags=["Health"])
def healthz() -> dict:
    """Alias Kubernetes (liveness) : doit répondre vite et sans I/O externe."""
    return {"status": "ok"}


@application.get("/api/readyz", tags=["Health"])
def readyz(response: Response) -> dict:
    """
    Readiness Kubernetes : vérifie que l'API peut accéder à la base.

    Les migrations tournent côté initContainer, mais la readiness doit s'assurer que PostgreSQL
    est joignable et que la connexion fonctionne.
    """
    try:
        # pool_pre_ping est activé ; on force une requête simple pour valider la connectivité réelle.
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"ready": False}
    return {"ready": True}
