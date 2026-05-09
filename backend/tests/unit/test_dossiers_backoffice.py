"""Tests US-06-01 — Tableau de bord gestionnaire : liste filtrée, triée et paginée."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.models.user import RoleEnum
from tests.conftest import create_user, create_vehicle

PASSWORD = "SecretMotDePasse1!"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cookie(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    """Authentifie via le login et retourne le header Cookie."""
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, f"Login failed: {login.text}"
    set_cookie = login.headers.get("set-cookie", "")
    token = set_cookie.split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _gest(client: TestClient, db: Session, email: str = "gest.bo@example.com") -> dict[str, str]:
    create_user(db, role=RoleEnum.gestionnaire, email=email, password=PASSWORD)
    return _cookie(client, email)


def _make_dossier(
    db: Session,
    *,
    client_email: str,
    vehicle_make: str = "Renault",
    type_: DossierTypeEnum = DossierTypeEnum.achat,
    status: DossierStatusEnum = DossierStatusEnum.depose,
    submitted_at: datetime | None = None,
    reference: str | None = None,
) -> Dossier:
    client = create_user(db, role=RoleEnum.client, email=client_email)
    vehicle = create_vehicle(db, make=vehicle_make)
    seq = db.query(Dossier).count() + 1
    d = Dossier(
        reference=reference or f"DOS-2026-{seq:05d}",
        type=type_,
        status=status,
        client_id=client.id,
        vehicle_id=vehicle.id,
        submitted_at=submitted_at,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


# ── Accès ─────────────────────────────────────────────────────────────────────

def test_backoffice_requires_auth(client: TestClient, db: Session) -> None:
    """Sans cookie la réponse est 401."""
    resp = client.get("/api/v1/dossiers/backoffice")
    assert resp.status_code == 401


def test_client_cannot_access_backoffice(client: TestClient, db: Session) -> None:
    """Un client ordinaire reçoit 403."""
    create_user(db, role=RoleEnum.client, email="client.bo@example.com", password=PASSWORD)
    headers = _cookie(client, "client.bo@example.com")
    resp = client.get("/api/v1/dossiers/backoffice", headers=headers)
    assert resp.status_code == 403


def test_gestionnaire_can_access_backoffice(client: TestClient, db: Session) -> None:
    """Un gestionnaire reçoit 200 avec la structure paginée."""
    headers = _gest(client, db)
    resp = client.get("/api/v1/dossiers/backoffice", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "page" in body
    assert "page_size" in body
    assert "items" in body


# ── Filtre par statut (défaut = depose + en_instruction) ─────────────────────

def test_default_filter_returns_only_active_dossiers(client: TestClient, db: Session) -> None:
    """Sans filtre explicite, seuls les dossiers déposés et en instruction sont retournés."""
    _make_dossier(db, client_email="c.dep@ex.com", status=DossierStatusEnum.depose, reference="DEP-001")
    _make_dossier(db, client_email="c.ins@ex.com", status=DossierStatusEnum.en_instruction, reference="INS-001")
    _make_dossier(db, client_email="c.val@ex.com", status=DossierStatusEnum.valide, reference="VAL-001")
    _make_dossier(db, client_email="c.bro@ex.com", status=DossierStatusEnum.brouillon, reference="BRO-001")
    headers = _gest(client, db,"gest.deffilter@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice", headers=headers)

    assert resp.status_code == 200
    statuts = {item["status"] for item in resp.json()["items"]}
    assert statuts == {"depose", "en_instruction"}


def test_explicit_statut_filter(client: TestClient, db: Session) -> None:
    """Le filtre statuts=valide retourne uniquement les dossiers validés."""
    _make_dossier(db, client_email="c.val2@ex.com", status=DossierStatusEnum.valide, reference="VAL-002")
    _make_dossier(db, client_email="c.dep2@ex.com", status=DossierStatusEnum.depose, reference="DEP-002")
    headers = _gest(client, db,"gest.statfilter@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?statuts=valide", headers=headers)

    assert resp.status_code == 200
    statuts = {item["status"] for item in resp.json()["items"]}
    assert statuts == {"valide"}


def test_invalid_statut_returns_422(client: TestClient, db: Session) -> None:
    """Un statut inconnu lève une 422."""
    headers = _gest(client, db,"gest.badstat@ex.com")
    resp = client.get("/api/v1/dossiers/backoffice?statuts=inconnu", headers=headers)
    assert resp.status_code == 422


# ── Filtre par type de contrat ────────────────────────────────────────────────

def test_filter_by_type_achat(client: TestClient, db: Session) -> None:
    """Le filtre type_contrat=achat ne retourne que les dossiers achat."""
    _make_dossier(db, client_email="c.ach@ex.com", type_=DossierTypeEnum.achat, reference="ACH-001")
    _make_dossier(db, client_email="c.lld@ex.com", type_=DossierTypeEnum.lld, reference="LLD-001")
    headers = _gest(client, db,"gest.typefilter@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?type_contrat=achat", headers=headers)

    assert resp.status_code == 200
    types = {item["type"] for item in resp.json()["items"]}
    assert types == {"achat"}


def test_filter_by_invalid_type_returns_422(client: TestClient, db: Session) -> None:
    """Un type inconnu lève une 422."""
    headers = _gest(client, db,"gest.badtype@ex.com")
    resp = client.get("/api/v1/dossiers/backoffice?type_contrat=leasing", headers=headers)
    assert resp.status_code == 422


# ── Filtre par date de dépôt ──────────────────────────────────────────────────

def test_filter_date_from_excludes_older(client: TestClient, db: Session) -> None:
    """Le filtre date_from exclut les dossiers soumis avant la date."""
    old_date = datetime(2026, 1, 1, tzinfo=timezone.utc)
    new_date = datetime(2026, 6, 1, tzinfo=timezone.utc)
    _make_dossier(db, client_email="c.old@ex.com", submitted_at=old_date, reference="OLD-001")
    _make_dossier(db, client_email="c.new@ex.com", submitted_at=new_date, reference="NEW-001")
    headers = _gest(client, db,"gest.datefrom@ex.com")

    resp = client.get(
        "/api/v1/dossiers/backoffice?date_from=2026-03-01T00:00:00",
        headers=headers,
    )

    assert resp.status_code == 200
    refs = [item["reference"] for item in resp.json()["items"]]
    assert "NEW-001" in refs
    assert "OLD-001" not in refs


def test_filter_date_to_excludes_newer(client: TestClient, db: Session) -> None:
    """Le filtre date_to exclut les dossiers soumis après la date."""
    old_date = datetime(2026, 1, 15, tzinfo=timezone.utc)
    new_date = datetime(2026, 8, 1, tzinfo=timezone.utc)
    _make_dossier(db, client_email="c.old2@ex.com", submitted_at=old_date, reference="OLD-002")
    _make_dossier(db, client_email="c.new2@ex.com", submitted_at=new_date, reference="NEW-002")
    headers = _gest(client, db,"gest.dateto@ex.com")

    resp = client.get(
        "/api/v1/dossiers/backoffice?date_to=2026-03-01T00:00:00",
        headers=headers,
    )

    assert resp.status_code == 200
    refs = [item["reference"] for item in resp.json()["items"]]
    assert "OLD-002" in refs
    assert "NEW-002" not in refs


# ── Tri ───────────────────────────────────────────────────────────────────────

def test_default_sort_oldest_submitted_first(client: TestClient, db: Session) -> None:
    """Par défaut (submitted_asc) les dossiers les plus anciens apparaissent en premier."""
    t1 = datetime(2026, 2, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    _make_dossier(db, client_email="c.s1@ex.com", submitted_at=t2, reference="SRT-B")
    _make_dossier(db, client_email="c.s2@ex.com", submitted_at=t1, reference="SRT-A")
    headers = _gest(client, db,"gest.sort@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice", headers=headers)

    assert resp.status_code == 200
    items = resp.json()["items"]
    refs = [i["reference"] for i in items if i["reference"] in ("SRT-A", "SRT-B")]
    assert refs.index("SRT-A") < refs.index("SRT-B")


def test_sort_submitted_desc(client: TestClient, db: Session) -> None:
    """sort=submitted_desc place les dossiers les plus récents en premier."""
    t1 = datetime(2026, 1, 10, tzinfo=timezone.utc)
    t2 = datetime(2026, 9, 10, tzinfo=timezone.utc)
    _make_dossier(db, client_email="c.sd1@ex.com", submitted_at=t1, reference="SD-OLD")
    _make_dossier(db, client_email="c.sd2@ex.com", submitted_at=t2, reference="SD-NEW")
    headers = _gest(client, db,"gest.sortdesc@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?sort=submitted_desc", headers=headers)

    assert resp.status_code == 200
    items = resp.json()["items"]
    refs = [i["reference"] for i in items if i["reference"] in ("SD-OLD", "SD-NEW")]
    assert refs.index("SD-NEW") < refs.index("SD-OLD")


# ── Pagination ────────────────────────────────────────────────────────────────

def test_pagination_respects_page_size(client: TestClient, db: Session) -> None:
    """page_size=2 retourne au plus 2 éléments."""
    for i in range(4):
        _make_dossier(db, client_email=f"c.pg{i}@ex.com", reference=f"PG-{i:03d}")
    headers = _gest(client, db,"gest.page@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?page_size=2", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) <= 2
    assert body["total"] >= 4
    assert body["page_size"] == 2


def test_pagination_page2_differs_from_page1(client: TestClient, db: Session) -> None:
    """La page 2 contient des dossiers différents de la page 1."""
    for i in range(4):
        _make_dossier(db, client_email=f"c.p2{i}@ex.com", reference=f"P2-{i:03d}")
    headers = _gest(client, db,"gest.page2@ex.com")

    r1 = client.get("/api/v1/dossiers/backoffice?page_size=2&page=1", headers=headers)
    r2 = client.get("/api/v1/dossiers/backoffice?page_size=2&page=2", headers=headers)

    ids_p1 = {i["id"] for i in r1.json()["items"]}
    ids_p2 = {i["id"] for i in r2.json()["items"]}
    assert ids_p1.isdisjoint(ids_p2)


# ── Contenu de la réponse ─────────────────────────────────────────────────────

def test_response_includes_client_info(client: TestClient, db: Session) -> None:
    """Chaque item expose les informations du client."""
    _make_dossier(db, client_email="c.info@ex.com", reference="INFO-001")
    headers = _gest(client, db,"gest.info@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?statuts=depose", headers=headers)

    assert resp.status_code == 200
    item = next(i for i in resp.json()["items"] if i["reference"] == "INFO-001")
    assert "client" in item
    assert item["client"]["email"] == "c.info@ex.com"
    assert "first_name" in item["client"]
    assert "last_name" in item["client"]


def test_response_includes_vehicle_info(client: TestClient, db: Session) -> None:
    """Chaque item expose les informations du véhicule."""
    _make_dossier(db, client_email="c.veh@ex.com", vehicle_make="Tesla", reference="VEH-001")
    headers = _gest(client, db,"gest.veh@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?statuts=depose", headers=headers)

    item = next(i for i in resp.json()["items"] if i["reference"] == "VEH-001")
    assert item["vehicle"]["make"] == "Tesla"


def test_response_includes_pieces_count(client: TestClient, db: Session) -> None:
    """Chaque item expose le nombre de pièces déposées."""
    _make_dossier(db, client_email="c.pieces@ex.com", reference="PC-001")
    headers = _gest(client, db,"gest.pieces@ex.com")

    resp = client.get("/api/v1/dossiers/backoffice?statuts=depose", headers=headers)

    item = next(i for i in resp.json()["items"] if i["reference"] == "PC-001")
    assert "pieces_count" in item
    assert isinstance(item["pieces_count"], int)
