"""Tests unitaires de création de dossier client (US-03-01)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.endpoints import dossiers as dossier_endpoints
from app.models.dossier import PieceJustificative
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


def test_upload_init_rejects_oversized_file(client: TestClient, db: Session) -> None:
    """Refuse un fichier > 10 Mo dès la phase de pré-signature."""
    user = create_user(db, email="client.pieces.maxsize@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()

    response = client.post(
        f"/api/v1/dossiers/{dossier['id']}/pieces/upload-init",
        json={
            "type_piece": "cni",
            "filename": "cni.pdf",
            "content_type": "application/pdf",
            "size_bytes": 10 * 1024 * 1024 + 1,
            "checksum_sha256": "a" * 64,
        },
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Fichier trop volumineux (10 Mo max)"


def test_upload_piece_flow_persists_piece_after_checksum_validation(
    client: TestClient,
    db: Session,
    monkeypatch,
) -> None:
    """Crée la pièce justificative après pré-signature + validation checksum."""
    user = create_user(db, email="client.pieces.upload@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()

    class _FakeS3:
        """Client S3 simulé pour isoler la logique API en test unitaire."""

        def head_bucket(self, **_: object) -> None:
            return None

        def generate_presigned_url(self, **_: object) -> str:
            return "https://minio.local/presigned"

    monkeypatch.setattr(dossier_endpoints, "get_s3_client", lambda: _FakeS3())
    monkeypatch.setattr(dossier_endpoints, "ensure_bucket_exists", lambda _: None)
    monkeypatch.setattr(dossier_endpoints, "verify_object_checksum", lambda *_, **__: True)

    init_response = client.post(
        f"/api/v1/dossiers/{dossier['id']}/pieces/upload-init",
        json={
            "type_piece": "cni",
            "filename": "cni.pdf",
            "content_type": "application/pdf",
            "size_bytes": 1200,
            "checksum_sha256": "a" * 64,
        },
        headers=headers,
    )
    assert init_response.status_code == 200
    assert init_response.json()["upload_url"] == "https://minio.local/presigned"

    complete_response = client.post(
        f"/api/v1/dossiers/{dossier['id']}/pieces/upload-complete",
        json={
            "type_piece": "cni",
            "filename": "cni.pdf",
            "s3_key": "dossiers/1/cni/cni.pdf",
            "checksum_sha256": "a" * 64,
        },
        headers=headers,
    )
    assert complete_response.status_code == 201
    saved_piece = db.query(PieceJustificative).filter(PieceJustificative.dossier_id == dossier["id"]).first()
    assert saved_piece is not None
    assert saved_piece.type_piece == "cni"


def test_upload_complete_rejects_checksum_mismatch(client: TestClient, db: Session, monkeypatch) -> None:
    """Rejette la finalisation si le checksum ne correspond pas."""
    user = create_user(db, email="client.pieces.checksum@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()

    monkeypatch.setattr(dossier_endpoints, "get_s3_client", lambda: object())
    monkeypatch.setattr(dossier_endpoints, "verify_object_checksum", lambda *_, **__: False)

    response = client.post(
        f"/api/v1/dossiers/{dossier['id']}/pieces/upload-complete",
        json={
            "type_piece": "cni",
            "filename": "cni.pdf",
            "s3_key": "dossiers/1/cni/cni.pdf",
            "checksum_sha256": "a" * 64,
        },
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Checksum SHA-256 non conforme"
