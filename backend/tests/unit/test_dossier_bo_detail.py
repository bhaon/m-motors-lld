"""Tests US-06-03 — Détail complet d'un dossier pour le gestionnaire."""

from __future__ import annotations

from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierHistorique, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"
PIECE_TYPES = ("cni", "permis", "revenus", "domicile", "rib")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cookie(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, f"Login failed: {login.text}"
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest_headers(client: TestClient, db: Session, email: str = "gest.det@ex.com") -> dict:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def _make_dossier(
    db: Session,
    *,
    client_email: str = "client.det@ex.com",
    status: DossierStatusEnum = DossierStatusEnum.depose,
    ref: str = "DET-001",
) -> Dossier:
    c = create_user(db, role=RoleEnum.client, email=client_email)
    v = create_vehicle(db)
    d = Dossier(
        reference=ref,
        type=DossierTypeEnum.achat,
        status=status,
        client_id=c.id,
        vehicle_id=v.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


# ── Accès ─────────────────────────────────────────────────────────────────────

def test_detail_requires_auth(client: TestClient, db: Session) -> None:
    """Sans cookie la réponse est 401."""
    d = _make_dossier(db)
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}")
    assert resp.status_code == 401


def test_client_cannot_access_bo_detail(client: TestClient, db: Session) -> None:
    """Un client ordinaire reçoit 403."""
    d = _make_dossier(db, client_email="c.no@ex.com")
    create_user(db, role=RoleEnum.client, email="c.try@ex.com", password=PASSWORD)
    resp = client.get(
        f"/api/v1/dossiers/backoffice/{d.id}",
        headers=_cookie(client, "c.try@ex.com"),
    )
    assert resp.status_code == 403


def test_detail_not_found(client: TestClient, db: Session) -> None:
    """Un id inexistant retourne 404."""
    headers = _gest_headers(client, db, "gest.nf@ex.com")
    resp = client.get("/api/v1/dossiers/backoffice/99999", headers=headers)
    assert resp.status_code == 404


# ── Données retournées ────────────────────────────────────────────────────────

def test_detail_returns_dossier_info(client: TestClient, db: Session) -> None:
    """Le détail contient id, reference et status corrects."""
    d = _make_dossier(db)
    headers = _gest_headers(client, db)

    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == d.id
    assert body["reference"] == "DET-001"
    assert body["status"] == "depose"


def test_detail_includes_client_info(client: TestClient, db: Session) -> None:
    """Le détail expose les informations du client (email, prénom, nom)."""
    c = create_user(db, role=RoleEnum.client, email="c.info@ex.com")
    v = create_vehicle(db)
    d = Dossier(
        reference="CLI-001",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.depose,
        client_id=c.id,
        vehicle_id=v.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    headers = _gest_headers(client, db, "gest.cli@ex.com")
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["client"]["email"] == "c.info@ex.com"
    assert body["client"]["first_name"] == "Test"
    assert body["client"]["last_name"] == "User"


def test_detail_includes_vehicle_info(client: TestClient, db: Session) -> None:
    """Le détail expose les informations du véhicule (make, model, year)."""
    c = create_user(db, role=RoleEnum.client, email="c.veh@ex.com")
    v = create_vehicle(db, make="Peugeot", model="308", year=2023)
    d = Dossier(
        reference="VEH-001",
        type=DossierTypeEnum.achat,
        status=DossierStatusEnum.depose,
        client_id=c.id,
        vehicle_id=v.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    headers = _gest_headers(client, db, "gest.veh@ex.com")
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["vehicle"]["make"] == "Peugeot"
    assert body["vehicle"]["model"] == "308"
    assert body["vehicle"]["year"] == 2023


def test_detail_pieces_has_all_required_types(client: TestClient, db: Session) -> None:
    """La liste des pièces contient les 5 types obligatoires."""
    d = _make_dossier(db, client_email="c.pcs@ex.com", ref="PCS-001")
    headers = _gest_headers(client, db, "gest.pcs@ex.com")

    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)

    assert resp.status_code == 200
    piece_types = {p["type_piece"] for p in resp.json()["pieces"]}
    assert piece_types == set(PIECE_TYPES)


def test_detail_pieces_all_not_uploaded_when_no_pieces(client: TestClient, db: Session) -> None:
    """Sans pièce uploadée, toutes les entrées ont uploaded=false."""
    d = _make_dossier(db, client_email="c.noup@ex.com", ref="NOUP-001")
    headers = _gest_headers(client, db, "gest.noup@ex.com")

    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)

    assert resp.status_code == 200
    assert all(not p["uploaded"] for p in resp.json()["pieces"])


def test_detail_includes_historique(client: TestClient, db: Session) -> None:
    """Le détail contient l'historique des changements de statut."""
    d = _make_dossier(db, client_email="c.hist@ex.com", ref="HIST-001")
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.hist@ex.com", password=PASSWORD)
    db.add(DossierHistorique(
        dossier_id=d.id,
        ancien_status="depose",
        nouveau_status="en_instruction",
        commentaire="Pris en charge par Test User",
        operateur_id=gest.id,
    ))
    db.commit()

    resp = client.get(
        f"/api/v1/dossiers/backoffice/{d.id}",
        headers=_cookie(client, "gest.hist@ex.com"),
    )

    assert resp.status_code == 200
    historique = resp.json()["historique"]
    assert len(historique) == 1
    assert historique[0]["ancien_status"] == "depose"
    assert historique[0]["nouveau_status"] == "en_instruction"


def test_detail_type_contrat_lld(client: TestClient, db: Session) -> None:
    """Le type de contrat LLD est bien exposé."""
    c = create_user(db, role=RoleEnum.client, email="c.lld@ex.com")
    v = create_vehicle(db)
    d = Dossier(
        reference="LLD-001",
        type=DossierTypeEnum.lld,
        status=DossierStatusEnum.depose,
        client_id=c.id,
        vehicle_id=v.id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)

    headers = _gest_headers(client, db, "gest.lld@ex.com")
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["type"] == "lld"


# ── Download URL gestionnaire ─────────────────────────────────────────────────

def test_download_url_requires_auth(client: TestClient, db: Session) -> None:
    """Sans cookie la réponse est 401."""
    d = _make_dossier(db, client_email="c.dlauth@ex.com", ref="DLAUTH-001")
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}/pieces/cni/download-url")
    assert resp.status_code == 401


def test_download_url_client_forbidden(client: TestClient, db: Session) -> None:
    """Un client reçoit 403 sur l'endpoint gestionnaire."""
    d = _make_dossier(db, client_email="c.dlfb@ex.com", ref="DLFB-001")
    create_user(db, role=RoleEnum.client, email="c.try2@ex.com", password=PASSWORD)
    resp = client.get(
        f"/api/v1/dossiers/backoffice/{d.id}/pieces/cni/download-url",
        headers=_cookie(client, "c.try2@ex.com"),
    )
    assert resp.status_code == 403


def test_download_url_dossier_not_found(client: TestClient, db: Session) -> None:
    """Un dossier inexistant retourne 404."""
    headers = _gest_headers(client, db, "gest.dl404@ex.com")
    resp = client.get("/api/v1/dossiers/backoffice/99999/pieces/cni/download-url", headers=headers)
    assert resp.status_code == 404


def test_download_url_piece_not_uploaded_returns_404(client: TestClient, db: Session) -> None:
    """Une pièce non uploadée retourne 404."""
    d = _make_dossier(db, client_email="c.dlnp@ex.com", ref="DLNP-001")
    headers = _gest_headers(client, db, "gest.dlnp@ex.com")
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}/pieces/cni/download-url", headers=headers)
    assert resp.status_code == 404


def test_download_url_returns_url_when_piece_exists(client: TestClient, db: Session, monkeypatch) -> None:
    """Une pièce uploadée retourne une URL pré-signée."""
    from app.models.dossier import PieceJustificative

    d = _make_dossier(db, client_email="c.dlok@ex.com", ref="DLOK-001")
    piece = PieceJustificative(
        dossier_id=d.id,
        type_piece="cni",
        filename="cni.pdf",
        s3_key="dossiers/1/cni.pdf",
        checksum="abc123",
    )
    db.add(piece)
    db.commit()

    monkeypatch.setattr(
        "app.api.v1.endpoints.dossiers.get_s3_client",
        lambda: MagicMock(),
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.dossiers.generate_download_url",
        lambda client, *, object_key, filename: "https://minio.example.com/presigned/cni.pdf",
    )

    headers = _gest_headers(client, db, "gest.dlok@ex.com")
    resp = client.get(f"/api/v1/dossiers/backoffice/{d.id}/pieces/cni/download-url", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["download_url"] == "https://minio.example.com/presigned/cni.pdf"
    assert body["filename"] == "cni.pdf"
