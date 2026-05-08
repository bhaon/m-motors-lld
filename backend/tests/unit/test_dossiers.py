"""Tests unitaires de création de dossier client (US-03-01)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.endpoints import dossiers as dossier_endpoints
from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum, PieceJustificative
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


def test_list_my_dossiers_returns_only_owner_sorted_desc(client: TestClient, db: Session) -> None:
    """Liste uniquement les dossiers du client connecté du plus récent au plus ancien."""
    owner = create_user(db, email="client.dossiers.owner@example.com")
    other = create_user(db, email="client.dossiers.other@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=owner.email, password="SecretMotDePasse1!")

    older = Dossier(
        reference="DOS-2026-00010",
        type=DossierTypeEnum.achat,
        client_id=owner.id,
        vehicle_id=vehicle.id,
    )
    newer = Dossier(
        reference="DOS-2026-00011",
        type=DossierTypeEnum.lld,
        client_id=owner.id,
        vehicle_id=vehicle.id,
    )
    foreign = Dossier(
        reference="DOS-2026-00012",
        type=DossierTypeEnum.lld,
        client_id=other.id,
        vehicle_id=vehicle.id,
    )
    db.add_all([older, newer, foreign])
    db.commit()

    response = client.get("/api/v1/dossiers/me", headers=headers)
    assert response.status_code == 200
    items = response.json()
    assert [item["reference"] for item in items] == ["DOS-2026-00011", "DOS-2026-00010"]
    assert all(item["client_id"] == owner.id for item in items)


def test_list_my_dossiers_requires_authentication(client: TestClient) -> None:
    """Refuse l'accès à la liste des dossiers sans cookie d'authentification."""
    response = client.get("/api/v1/dossiers/me")
    assert response.status_code == 401


def test_get_dossier_detail_returns_checklist_and_missing_pieces(client: TestClient, db: Session) -> None:
    """Retourne la checklist détaillée avec pièces manquantes pour un dossier client."""
    user = create_user(db, email="client.detail@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]
    db.add(
        PieceJustificative(
            dossier_id=dossier_id,
            type_piece="cni",
            filename="cni.pdf",
            s3_key="dossiers/x/cni.pdf",
            checksum="a" * 64,
        )
    )
    db.commit()

    response = client.get(f"/api/v1/dossiers/{dossier_id}", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["can_submit"] is False
    assert "permis" in body["missing_pieces"]
    assert any(item["type_piece"] == "cni" and item["uploaded"] for item in body["checklist"])


def test_submit_dossier_rejected_when_missing_pieces(client: TestClient, db: Session) -> None:
    """Bloque la soumission tant qu'au moins une pièce obligatoire manque."""
    user = create_user(db, email="client.submit.blocked@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()

    response = client.post(f"/api/v1/dossiers/{dossier_payload['id']}/submit", headers=headers)
    assert response.status_code == 400
    assert "Pièces manquantes" in response.json()["detail"]


def test_submit_dossier_sets_status_depose_when_complete(client: TestClient, db: Session) -> None:
    """Soumet le dossier complet et passe son statut à `depose`."""
    user = create_user(db, email="client.submit.ok@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]

    for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
        db.add(
            PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"{piece_type}.pdf",
                s3_key=f"dossiers/x/{piece_type}.pdf",
                checksum="a" * 64,
            )
        )
    db.commit()

    response = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == DossierStatusEnum.depose.value
    assert response.json()["can_submit"] is True


def test_submit_dossier_sends_status_change_email_on_deposit(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """Envoie une notification de changement de statut (depose) lors de la soumission du dossier."""
    user = create_user(db, email="client.submit.email@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]

    for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
        db.add(
            PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"{piece_type}.pdf",
                s3_key=f"dossiers/x/{piece_type}.pdf",
                checksum="a" * 64,
            )
        )
    db.commit()

    captured: dict[str, str] = {}

    def _fake_send_status_change_email(
        *, to_email: str, dossier_reference: str, nouveau_status: str, dossier_url: str, motif_rejet: str | None = None
    ) -> None:
        """Capture les paramètres pour vérifier le contrat d'appel."""
        captured["to_email"] = to_email
        captured["dossier_reference"] = dossier_reference
        captured["nouveau_status"] = nouveau_status
        captured["dossier_url"] = dossier_url

    monkeypatch.setattr(dossier_endpoints, "send_status_change_email", _fake_send_status_change_email)

    response = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    assert response.status_code == 200
    assert captured["to_email"] == user.email
    assert captured["dossier_reference"] == response.json()["reference"]
    assert captured["nouveau_status"] == "depose"
    assert f"/mes-dossiers/{dossier_id}" in captured["dossier_url"]


def test_submit_dossier_returns_submitted_at_in_utc(client: TestClient, db: Session) -> None:
    """Retourne un horodatage de soumission cohérent avec le fuseau UTC."""
    user = create_user(db, email="client.submit.utc@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]

    for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
        db.add(
            PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"{piece_type}.pdf",
                s3_key=f"dossiers/x/{piece_type}.pdf",
                checksum="a" * 64,
            )
        )
    db.commit()

    response = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    assert response.status_code == 200
    submitted_at = response.json()["submitted_at"]
    assert submitted_at is not None
    submitted_at_dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
    assert submitted_at_dt.utcoffset() == timezone.utc.utcoffset(submitted_at_dt)


def test_submit_dossier_persists_submitted_at_in_database(client: TestClient, db: Session) -> None:
    """Apres soumission, `submitted_at` est bien enregistre sur le dossier en base (traitement futur)."""
    user = create_user(db, email="client.submit.dbpersist@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]

    for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
        db.add(
            PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"{piece_type}.pdf",
                s3_key=f"dossiers/x/{piece_type}.pdf",
                checksum="a" * 64,
            )
        )
    db.commit()

    response = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    assert response.status_code == 200

    db.expunge_all()
    dossier_db = db.query(Dossier).filter(Dossier.id == dossier_id).one()
    assert dossier_db.submitted_at is not None
    assert dossier_db.submitted_at.tzinfo is not None
    assert dossier_db.status == DossierStatusEnum.depose


def test_delete_dossier_removes_owned_brouillon(client: TestClient, db: Session) -> None:
    """Supprime le dossier du client lorsque son statut est brouillon."""
    user = create_user(db, email="client.delete.ok@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    created = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = created["id"]

    response = client.delete(f"/api/v1/dossiers/{dossier_id}", headers=headers)
    assert response.status_code == 204
    assert db.query(Dossier).filter(Dossier.id == dossier_id).first() is None


def test_delete_dossier_rejects_non_brouillon_status(client: TestClient, db: Session) -> None:
    """Refuse la suppression dès que le dossier n'est plus en brouillon."""
    user = create_user(db, email="client.delete.blocked@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier = db.query(Dossier).filter(Dossier.id == dossier_payload["id"]).first()
    assert dossier is not None
    dossier.status = DossierStatusEnum.depose
    db.commit()

    response = client.delete(f"/api/v1/dossiers/{dossier_payload['id']}", headers=headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Seuls les dossiers en brouillon peuvent être supprimés."


def test_delete_dossier_rejects_non_owner(client: TestClient, db: Session) -> None:
    """Refuse la suppression d'un dossier qui n'appartient pas au client connecté."""
    owner = create_user(db, email="client.delete.owner@example.com")
    other = create_user(db, email="client.delete.other@example.com")
    vehicle = create_vehicle(db, lld=True)
    owner_headers = _auth_cookie_header(client, email=owner.email, password="SecretMotDePasse1!")
    other_headers = _auth_cookie_header(client, email=other.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=owner_headers).json()

    response = client.delete(f"/api/v1/dossiers/{dossier_payload['id']}", headers=other_headers)
    assert response.status_code == 404


# ── US-04-01 : Tableau de bord client ────────────────────────────────────────

def test_list_my_dossiers_returns_vehicle_info(client: TestClient, db: Session) -> None:
    """GET /me retourne les infos véhicule (make, model, year) avec chaque dossier."""
    user = create_user(db, email="client.dashboard@example.com")
    vehicle = create_vehicle(db, make="Renault", model="Clio", year=2024, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers)

    response = client.get("/api/v1/dossiers/me", headers=headers)

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    item = items[0]
    assert item["reference"].startswith("DOS-")
    assert item["vehicle"]["make"] == "Renault"
    assert item["vehicle"]["model"] == "Clio"
    assert item["vehicle"]["year"] == 2024


def test_list_my_dossiers_returns_only_own_dossiers(client: TestClient, db: Session) -> None:
    """GET /me ne retourne que les dossiers du client connecté, pas ceux des autres."""
    user_a = create_user(db, email="client.dashboard.a@example.com")
    user_b = create_user(db, email="client.dashboard.b@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers_a = _auth_cookie_header(client, email=user_a.email, password="SecretMotDePasse1!")
    headers_b = _auth_cookie_header(client, email=user_b.email, password="SecretMotDePasse1!")

    client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers_a)
    client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers_b)

    response = client.get("/api/v1/dossiers/me", headers=headers_a)

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert all(item["client_id"] == user_a.id for item in items)


def test_list_my_dossiers_empty_for_new_client(client: TestClient, db: Session) -> None:
    """GET /me retourne une liste vide pour un client sans dossier."""
    user = create_user(db, email="client.nodossier@example.com")
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    response = client.get("/api/v1/dossiers/me", headers=headers)

    assert response.status_code == 200
    assert response.json() == []


def test_list_my_dossiers_ordered_most_recent_first(client: TestClient, db: Session) -> None:
    """GET /me retourne les dossiers du plus récent au plus ancien."""
    user = create_user(db, email="client.dashboard.order@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    first = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers).json()
    second = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers).json()

    response = client.get("/api/v1/dossiers/me", headers=headers)

    assert response.status_code == 200
    items = response.json()
    assert items[0]["id"] == second["id"]
    assert items[1]["id"] == first["id"]


def test_list_my_dossiers_requires_authentication_dashboard(client: TestClient) -> None:
    """GET /me retourne 401 sans cookie d'authentification."""
    response = client.get("/api/v1/dossiers/me")
    assert response.status_code == 401


# ── US-04-02 : Détail dossier avec historique et téléchargement ───────────────

def test_get_dossier_detail_includes_vehicle_info(client: TestClient, db: Session) -> None:
    """GET /{id} retourne les infos véhicule (make, model, year) dans le détail du dossier."""
    user = create_user(db, email="client.detail.vehicle@example.com")
    vehicle = create_vehicle(db, make="Toyota", model="Yaris", year=2025, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    dossier = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers
    ).json()

    response = client.get(f"/api/v1/dossiers/{dossier['id']}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["vehicle"]["make"] == "Toyota"
    assert body["vehicle"]["model"] == "Yaris"
    assert body["vehicle"]["year"] == 2025


def test_get_dossier_detail_includes_empty_historique(client: TestClient, db: Session) -> None:
    """GET /{id} retourne un historique vide pour un dossier nouvellement créé."""
    user = create_user(db, email="client.detail.historique@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    dossier = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers
    ).json()

    response = client.get(f"/api/v1/dossiers/{dossier['id']}", headers=headers)

    assert response.status_code == 200
    assert response.json()["historique"] == []


def test_get_dossier_detail_includes_motif_rejet_null_by_default(client: TestClient, db: Session) -> None:
    """GET /{id} retourne motif_rejet à null pour un dossier non rejeté."""
    user = create_user(db, email="client.detail.motif@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    dossier = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers
    ).json()

    response = client.get(f"/api/v1/dossiers/{dossier['id']}", headers=headers)

    assert response.status_code == 200
    assert response.json()["motif_rejet"] is None


def test_get_dossier_detail_checklist_includes_filename_when_uploaded(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """GET /{id} retourne le nom du fichier dans la checklist pour une pièce uploadée."""
    from app.models.dossier import PieceJustificative

    user = create_user(db, email="client.detail.filename@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    dossier_payload = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers
    ).json()

    piece = PieceJustificative(
        dossier_id=dossier_payload["id"],
        type_piece="cni",
        filename="ma-cni.pdf",
        s3_key="dossiers/1/cni/ma-cni.pdf",
        checksum="a" * 64,
    )
    db.add(piece)
    db.commit()

    response = client.get(f"/api/v1/dossiers/{dossier_payload['id']}", headers=headers)

    assert response.status_code == 200
    checklist = {item["type_piece"]: item for item in response.json()["checklist"]}
    assert checklist["cni"]["uploaded"] is True
    assert checklist["cni"]["filename"] == "ma-cni.pdf"
    assert checklist["permis"]["filename"] is None


def test_download_url_returns_presigned_url(client: TestClient, db: Session, monkeypatch) -> None:
    """GET /{id}/pieces/{type}/download-url retourne une URL pré-signée pour la pièce."""
    from app.models.dossier import PieceJustificative
    import app.api.v1.endpoints.dossiers as dossiers_module

    user = create_user(db, email="client.download@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    dossier_payload = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers
    ).json()

    piece = PieceJustificative(
        dossier_id=dossier_payload["id"],
        type_piece="rib",
        filename="mon-rib.pdf",
        s3_key="dossiers/1/rib/mon-rib.pdf",
        checksum="b" * 64,
    )
    db.add(piece)
    db.commit()

    monkeypatch.setattr(
        dossiers_module,
        "generate_download_url",
        lambda *args, **kwargs: "https://s3.example/presigned-download-url",
    )
    monkeypatch.setattr(dossiers_module, "get_s3_client", lambda: None)

    response = client.get(
        f"/api/v1/dossiers/{dossier_payload['id']}/pieces/rib/download-url", headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["download_url"] == "https://s3.example/presigned-download-url"
    assert body["filename"] == "mon-rib.pdf"


def test_download_url_returns_404_when_piece_missing(client: TestClient, db: Session) -> None:
    """GET /{id}/pieces/{type}/download-url retourne 404 si la pièce n'a pas été uploadée."""
    user = create_user(db, email="client.download.missing@example.com")
    vehicle = create_vehicle(db, lld=False)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")

    dossier_payload = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=headers
    ).json()

    response = client.get(
        f"/api/v1/dossiers/{dossier_payload['id']}/pieces/cni/download-url", headers=headers
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Document non trouvé."


def test_download_url_rejects_non_owner(client: TestClient, db: Session) -> None:
    """GET /{id}/pieces/{type}/download-url retourne 404 si le dossier n'appartient pas au client."""
    owner = create_user(db, email="client.download.owner@example.com")
    other = create_user(db, email="client.download.other@example.com")
    vehicle = create_vehicle(db, lld=False)
    owner_headers = _auth_cookie_header(client, email=owner.email, password="SecretMotDePasse1!")
    other_headers = _auth_cookie_header(client, email=other.email, password="SecretMotDePasse1!")

    dossier_payload = client.post(
        "/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "achat"}, headers=owner_headers
    ).json()

    response = client.get(
        f"/api/v1/dossiers/{dossier_payload['id']}/pieces/cni/download-url", headers=other_headers
    )

    assert response.status_code == 404


# ── US-04-03 : Notification email à chaque changement de statut ──────────────

def test_submit_dossier_email_dossier_url_contains_dossier_id(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """L'URL du dossier incluse dans la notification contient l'identifiant du dossier."""
    user = create_user(db, email="client.emailurl@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]

    for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
        db.add(
            PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"{piece_type}.pdf",
                s3_key=f"dossiers/x/{piece_type}.pdf",
                checksum="a" * 64,
            )
        )
    db.commit()

    captured_url: list[str] = []

    def _fake_send(*, to_email: str, dossier_reference: str, nouveau_status: str, dossier_url: str, motif_rejet: str | None = None) -> None:
        captured_url.append(dossier_url)

    monkeypatch.setattr(dossier_endpoints, "send_status_change_email", _fake_send)

    response = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    assert response.status_code == 200
    assert len(captured_url) == 1
    assert str(dossier_id) in captured_url[0]
    assert "mes-dossiers" in captured_url[0]


def test_submit_dossier_email_failure_does_not_block_submission(
    client: TestClient, db: Session, monkeypatch
) -> None:
    """Un échec d'envoi email n'annule pas une soumission déjà validée en base."""
    user = create_user(db, email="client.emailfail@example.com")
    vehicle = create_vehicle(db, lld=True)
    headers = _auth_cookie_header(client, email=user.email, password="SecretMotDePasse1!")
    dossier_payload = client.post("/api/v1/dossiers", json={"vehicle_id": vehicle.id, "type": "lld"}, headers=headers).json()
    dossier_id = dossier_payload["id"]

    for piece_type in ("cni", "permis", "revenus", "domicile", "rib"):
        db.add(
            PieceJustificative(
                dossier_id=dossier_id,
                type_piece=piece_type,
                filename=f"{piece_type}.pdf",
                s3_key=f"dossiers/x/{piece_type}.pdf",
                checksum="a" * 64,
            )
        )
    db.commit()

    def _failing_send(**_: object) -> None:
        raise RuntimeError("Resend indisponible")

    monkeypatch.setattr(dossier_endpoints, "send_status_change_email", _failing_send)

    response = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "depose"

    db.expunge_all()
    dossier_db = db.query(Dossier).filter(Dossier.id == dossier_id).one()
    assert dossier_db.status == DossierStatusEnum.depose
