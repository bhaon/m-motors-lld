"""Tests unitaires de création de dossier client (US-03-01)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import create_user, create_vehicle


def _auth_cookie_header(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    """Authentifie un utilisateur et renvoie le header Cookie prêt à l'emploi."""
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    set_cookie = login.headers.get("set-cookie", "")
    access_token = set_cookie.split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={access_token}"}


def test_create_dossier_achat_returns_unique_reference(client: TestClient, db: Session) -> None:
    """Crée un dossier Achat et retourne une référence lisible unique."""
    user = create_user(db, email="client.dossier@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    first = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "achat"},
        headers=headers,
    )
    second = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "achat"},
        headers=headers,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    body1 = first.json()
    body2 = second.json()
    assert body1["reference"].startswith("DOS-")
    assert body2["reference"].startswith("DOS-")
    assert body1["reference"] != body2["reference"]
    assert body1["type"] == "achat"


def test_create_dossier_lld_for_non_lld_vehicle_rejected(client: TestClient, db: Session) -> None:
    """Refuse un dossier LLD si le véhicule n'est pas éligible."""
    user = create_user(db, email="client.dossier.lld@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": vehicle.id, "type": "lld"},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Ce véhicule n'accepte pas la LLD"


def test_create_dossier_requires_authentication(client: TestClient, db: Session) -> None:
    """Bloque la création de dossier sans cookie d'authentification."""
    vehicle = create_vehicle(db, lld=True)
    response = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"})
    assert response.status_code == 401
