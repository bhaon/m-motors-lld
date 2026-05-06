"""Tests sur l'application FastAPI (health)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings


def test_health_ok(client: TestClient) -> None:
    """GET /api/health renvoie le statut et la version."""
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["version"] == settings.APP_VERSION


def test_healthz_ok(client: TestClient) -> None:
    """GET /api/healthz renvoie 200 (liveness)."""
    r = client.get("/api/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readyz_ok(client: TestClient) -> None:
    """GET /api/readyz renvoie 200 quand la DB est accessible (SQLite tests)."""
    r = client.get("/api/readyz")
    assert r.status_code == 200
    assert r.json()["ready"] is True
