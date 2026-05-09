"""Tests US-05-05 — Gestion des photos véhicule (galerie, principale, ordre, suppression)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import RoleEnum
from app.models.vehicle import Vehicle, VehiclePhoto
from tests.conftest import auth_header, create_user, create_vehicle


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gest(db: Session, email: str = "gest.photo@example.com") -> dict:
    g = create_user(db, role=RoleEnum.gestionnaire, email=email)
    return auth_header(g)


def _add_photo(db: Session, vehicle_id: int, url: str, is_main: bool = False, order: int = 0) -> VehiclePhoto:
    p = VehiclePhoto(vehicle_id=vehicle_id, url=url, is_main=is_main, order=order)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# ── Liste des photos ──────────────────────────────────────────────────────────

def test_list_photos_returns_ordered_photos(client: TestClient, db: Session) -> None:
    """GET /vehicules/{id}/photos retourne les photos triées par ordre."""
    v = create_vehicle(db)
    _add_photo(db, v.id, "https://example.com/b.jpg", order=2)
    _add_photo(db, v.id, "https://example.com/a.jpg", order=1)
    headers = _gest(db)

    resp = client.get(f"/api/v1/vehicules/{v.id}/photos", headers=headers)

    assert resp.status_code == 200
    photos = resp.json()
    assert len(photos) == 2
    assert photos[0]["url"] == "https://example.com/a.jpg"
    assert photos[1]["url"] == "https://example.com/b.jpg"


def test_list_photos_empty_when_no_gallery(client: TestClient, db: Session) -> None:
    """Un véhicule sans VehiclePhoto retourne une liste vide."""
    v = create_vehicle(db)
    headers = _gest(db)
    resp = client.get(f"/api/v1/vehicules/{v.id}/photos", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_non_gestionnaire_cannot_list_photos(client: TestClient, db: Session) -> None:
    """Un client ne peut pas accéder aux photos back-office → 403."""
    v = create_vehicle(db)
    client_user = create_user(db, role=RoleEnum.client, email="client.photo@example.com")
    resp = client.get(f"/api/v1/vehicules/{v.id}/photos", headers=auth_header(client_user))
    assert resp.status_code == 403


# ── Ajout de photos ───────────────────────────────────────────────────────────

def test_add_valid_jpg_photo(client: TestClient, db: Session) -> None:
    """POST /vehicules/{id}/photos ajoute une photo JPG valide."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.addjpg@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos",
        json={"urls": ["https://example.com/photo.jpg"]},
        headers=headers,
    )

    assert resp.status_code == 201
    photos = resp.json()
    assert len(photos) == 1
    assert photos[0]["url"] == "https://example.com/photo.jpg"
    assert photos[0]["is_main"] is False


def test_add_multiple_photos_at_once(client: TestClient, db: Session) -> None:
    """Ajout de plusieurs URLs en une seule requête."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.multi@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos",
        json={"urls": ["https://ex.com/1.jpg", "https://ex.com/2.png", "https://ex.com/3.jpeg"]},
        headers=headers,
    )

    assert resp.status_code == 201
    assert len(resp.json()) == 3


def test_add_photo_rejects_unsupported_format(client: TestClient, db: Session) -> None:
    """URL pointant vers un format non supporté (gif, webp) → 422."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.format@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos",
        json={"urls": ["https://example.com/photo.gif"]},
        headers=headers,
    )

    assert resp.status_code == 422


def test_add_photos_increments_order(client: TestClient, db: Session) -> None:
    """Les nouvelles photos reçoivent un ordre supérieur aux existantes."""
    v = create_vehicle(db)
    _add_photo(db, v.id, "https://example.com/first.jpg", order=5)
    headers = _gest(db, "gest.order@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos",
        json={"urls": ["https://example.com/second.jpg"]},
        headers=headers,
    )

    assert resp.status_code == 201
    orders = [p["order"] for p in resp.json()]
    assert max(orders) > 5


# ── Photo principale ──────────────────────────────────────────────────────────

def test_set_main_photo_updates_vehicle_img(client: TestClient, db: Session) -> None:
    """PATCH /photos/{id}/principal met à jour vehicle.img et is_main."""
    v = create_vehicle(db)
    p1 = _add_photo(db, v.id, "https://example.com/main.jpg", is_main=True, order=1)
    p2 = _add_photo(db, v.id, "https://example.com/new_main.jpg", is_main=False, order=2)
    headers = _gest(db, "gest.setmain@example.com")

    resp = client.patch(f"/api/v1/vehicules/{v.id}/photos/{p2.id}/principal", headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    updated = db.query(Vehicle).filter(Vehicle.id == v.id).first()
    assert updated is not None
    assert updated.img == "https://example.com/new_main.jpg"
    old_main = db.query(VehiclePhoto).filter(VehiclePhoto.id == p1.id).first()
    assert old_main is not None
    assert old_main.is_main is False
    new_main = db.query(VehiclePhoto).filter(VehiclePhoto.id == p2.id).first()
    assert new_main is not None
    assert new_main.is_main is True


# ── Réordonnancement ─────────────────────────────────────────────────────────

def test_reorder_photos(client: TestClient, db: Session) -> None:
    """POST /photos/reordonner applique de nouveaux ordres."""
    v = create_vehicle(db)
    p1 = _add_photo(db, v.id, "https://example.com/r1.jpg", order=1)
    p2 = _add_photo(db, v.id, "https://example.com/r2.jpg", order=2)
    headers = _gest(db, "gest.reorder@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos/reordonner",
        json={"photos": [{"id": p1.id, "order": 10}, {"id": p2.id, "order": 5}]},
        headers=headers,
    )

    assert resp.status_code == 200
    db.expire_all()
    updated_p1 = db.query(VehiclePhoto).filter(VehiclePhoto.id == p1.id).first()
    updated_p2 = db.query(VehiclePhoto).filter(VehiclePhoto.id == p2.id).first()
    assert updated_p1 is not None
    assert updated_p2 is not None
    assert updated_p1.order == 10
    assert updated_p2.order == 5


# ── Suppression ───────────────────────────────────────────────────────────────

def test_delete_non_main_photo(client: TestClient, db: Session) -> None:
    """DELETE /photos/{id} supprime une photo non principale."""
    v = create_vehicle(db)
    p1 = _add_photo(db, v.id, "https://example.com/keep.jpg", is_main=True, order=1)
    p2 = _add_photo(db, v.id, "https://example.com/remove.jpg", is_main=False, order=2)
    p1_id = p1.id
    p2_id = p2.id
    headers = _gest(db, "gest.del@example.com")

    resp = client.delete(f"/api/v1/vehicules/{v.id}/photos/{p2_id}", headers=headers)

    assert resp.status_code == 204
    db.expire_all()
    assert db.query(VehiclePhoto).filter(VehiclePhoto.id == p2_id).first() is None
    assert db.query(VehiclePhoto).filter(VehiclePhoto.id == p1_id).first() is not None


def test_delete_main_photo_promotes_next(client: TestClient, db: Session) -> None:
    """Supprimer la photo principale désigne automatiquement la suivante."""
    v = create_vehicle(db)
    p1 = _add_photo(db, v.id, "https://example.com/main.jpg", is_main=True, order=1)
    p2 = _add_photo(db, v.id, "https://example.com/next.jpg", is_main=False, order=2)
    headers = _gest(db, "gest.delmain@example.com")

    resp = client.delete(f"/api/v1/vehicules/{v.id}/photos/{p1.id}", headers=headers)

    assert resp.status_code == 204
    db.expire_all()
    promoted = db.query(VehiclePhoto).filter(VehiclePhoto.id == p2.id).first()
    assert promoted is not None
    assert promoted.is_main is True
    updated_v = db.query(Vehicle).filter(Vehicle.id == v.id).first()
    assert updated_v is not None
    assert updated_v.img == "https://example.com/next.jpg"


def test_cannot_delete_last_main_photo(client: TestClient, db: Session) -> None:
    """Impossible de supprimer la seule photo principale → 400."""
    v = create_vehicle(db)
    p = _add_photo(db, v.id, "https://example.com/only.jpg", is_main=True, order=1)
    headers = _gest(db, "gest.lastdel@example.com")

    resp = client.delete(f"/api/v1/vehicules/{v.id}/photos/{p.id}", headers=headers)

    assert resp.status_code == 400
    assert "supprimer" in resp.json()["detail"].lower()


def test_delete_photo_not_found_returns_404(client: TestClient, db: Session) -> None:
    """Supprimer une photo inexistante → 404."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.del404@example.com")
    resp = client.delete(f"/api/v1/vehicules/{v.id}/photos/99999", headers=headers)
    assert resp.status_code == 404


# ── Upload MinIO (US-05-05) ───────────────────────────────────────────────────

def test_upload_init_returns_presigned_url(client: TestClient, db: Session) -> None:
    """POST /photos/upload-init retourne une URL pré-signée et un object_key."""
    from unittest.mock import MagicMock, patch

    v = create_vehicle(db)
    headers = _gest(db, "gest.uploadi@example.com")

    with patch("app.api.v1.endpoints.vehicles.get_s3_client") as mock_s3, \
         patch("app.api.v1.endpoints.vehicles.ensure_photos_bucket"), \
         patch("app.api.v1.endpoints.vehicles.generate_photo_upload_url") as mock_url:
        mock_s3.return_value = MagicMock()
        mock_url.return_value = "https://minio.example.com/mmotors-photos/vehicules/1/presigned"

        resp = client.post(
            f"/api/v1/vehicules/{v.id}/photos/upload-init",
            json={"filename": "photo.jpg", "content_type": "image/jpeg", "file_size": 1024},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "upload_url" in body
    assert "object_key" in body
    assert "vehicules" in body["object_key"]


def test_upload_init_rejects_large_file(client: TestClient, db: Session) -> None:
    """upload-init retourne 422 si le fichier dépasse 5 Mo."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.uploadbig@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos/upload-init",
        json={"filename": "big.jpg", "content_type": "image/jpeg", "file_size": 6 * 1024 * 1024},
        headers=headers,
    )
    assert resp.status_code == 422


def test_upload_init_rejects_unsupported_content_type(client: TestClient, db: Session) -> None:
    """upload-init retourne 422 pour un content-type non supporté."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.uploadtype@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos/upload-init",
        json={"filename": "anim.gif", "content_type": "image/gif", "file_size": 512},
        headers=headers,
    )
    assert resp.status_code == 422


def test_upload_complete_creates_vehicle_photo(client: TestClient, db: Session) -> None:
    """POST /photos/upload-complete crée un enregistrement VehiclePhoto."""
    from app.models.vehicle import VehiclePhoto
    from unittest.mock import patch

    v = create_vehicle(db)
    headers = _gest(db, "gest.uploadc@example.com")
    object_key = f"vehicules/{v.id}/20260101-photo.jpg"

    with patch("app.api.v1.endpoints.vehicles.build_photo_public_url") as mock_url:
        mock_url.return_value = f"https://minio.example.com/mmotors-photos/{object_key}"
        resp = client.post(
            f"/api/v1/vehicules/{v.id}/photos/upload-complete",
            json={"object_key": object_key},
            headers=headers,
        )

    assert resp.status_code == 201
    db.expire_all()
    photos = db.query(VehiclePhoto).filter(VehiclePhoto.vehicle_id == v.id).all()
    assert len(photos) == 1
    assert "mmotors-photos" in photos[0].url


# ── Bibliothèque et réutilisation ─────────────────────────────────────────────

def test_bibliotheque_lists_photos_across_vehicles(client: TestClient, db: Session) -> None:
    """GET /photos/bibliotheque retourne les photos de tous les véhicules."""
    v1 = create_vehicle(db, make="VehA")
    v2 = create_vehicle(db, make="VehB")
    _add_photo(db, v1.id, "https://example.com/vehA.jpg")
    _add_photo(db, v2.id, "https://example.com/vehB.jpg")
    headers = _gest(db, "gest.biblio@example.com")

    resp = client.get("/api/v1/vehicules/photos/bibliotheque", headers=headers)

    assert resp.status_code == 200
    urls = [p["url"] for p in resp.json()]
    assert "https://example.com/vehA.jpg" in urls
    assert "https://example.com/vehB.jpg" in urls


def test_depuis_bibliotheque_adds_photo(client: TestClient, db: Session) -> None:
    """POST /photos/depuis-bibliotheque ajoute une photo existante au véhicule cible."""
    v_source = create_vehicle(db, make="Source")
    v_target = create_vehicle(db, make="Target")
    source_photo = _add_photo(db, v_source.id, "https://example.com/shared.jpg")
    headers = _gest(db, "gest.library@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v_target.id}/photos/depuis-bibliotheque",
        json={"source_photo_id": source_photo.id},
        headers=headers,
    )

    assert resp.status_code == 201
    urls = [p["url"] for p in resp.json()]
    assert "https://example.com/shared.jpg" in urls


def test_depuis_bibliotheque_source_not_found_returns_404(client: TestClient, db: Session) -> None:
    """depuis-bibliotheque avec un id source inexistant → 404."""
    v = create_vehicle(db)
    headers = _gest(db, "gest.libnotfound@example.com")

    resp = client.post(
        f"/api/v1/vehicules/{v.id}/photos/depuis-bibliotheque",
        json={"source_photo_id": 99999},
        headers=headers,
    )
    assert resp.status_code == 404
