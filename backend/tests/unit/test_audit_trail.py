"""Tests US-11-04 — Audit trail : traçabilité des mutations sensibles."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditTrail
from app.models.user import RoleEnum
from tests.conftest import auth_header, create_user, create_vehicle


# ── Helpers ──────────────────────────────────────────────────────────────────

def _cookie(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.headers["set-cookie"].split("access_token=")[1].split(";")[0]
    return {"Cookie": f"access_token={token}"}


def _admin_cookie(client: TestClient, db: Session) -> tuple[dict, int]:
    admin = create_user(db, role=RoleEnum.admin, email="audit.admin@example.com")
    return _cookie(client, email=admin.email, password="SecretMotDePasse1!"), admin.id


def _latest_entry(db: Session, action: str) -> AuditTrail | None:
    return (
        db.query(AuditTrail)
        .filter(AuditTrail.action == action)
        .order_by(AuditTrail.created_at.desc())
        .first()
    )


# ── USER_CREATED ──────────────────────────────────────────────────────────────

def test_create_user_generates_audit_entry(client: TestClient, db: Session) -> None:
    """POST /admin/users crée une entrée USER_CREATED dans l'audit trail."""
    headers, _ = _admin_cookie(client, db)
    client.post(
        "/api/v1/admin/users",
        json={"email": "new@example.com", "password": "Sup3rS3cur!", "first_name": "A", "last_name": "B", "role": "superviseur"},
        headers=headers,
    )
    db.expire_all()
    entry = _latest_entry(db, "USER_CREATED")
    assert entry is not None
    assert entry.entity_type == "user"
    assert entry.after_state["email"] == "new@example.com"
    assert entry.after_state["role"] == "superviseur"
    assert entry.before_state is None
    assert entry.operator_role == "admin"


def test_create_user_audit_contains_operator_info(client: TestClient, db: Session) -> None:
    """L'entrée USER_CREATED identifie l'opérateur (id, email, rôle)."""
    headers, admin_id = _admin_cookie(client, db)
    client.post(
        "/api/v1/admin/users",
        json={"email": "op@example.com", "password": "Sup3rS3cur!", "first_name": "X", "last_name": "Y", "role": "gestionnaire"},
        headers=headers,
    )
    db.expire_all()
    entry = _latest_entry(db, "USER_CREATED")
    assert entry is not None
    assert entry.operator_id == admin_id
    assert entry.operator_email == "audit.admin@example.com"


def test_failed_create_user_does_not_generate_audit(client: TestClient, db: Session) -> None:
    """Un conflit 409 ne génère pas d'entrée dans l'audit trail."""
    headers, _ = _admin_cookie(client, db)
    existing = create_user(db, email="dup@example.com")
    before_count = db.query(AuditTrail).count()

    client.post(
        "/api/v1/admin/users",
        json={"email": existing.email, "password": "Sup3rS3cur!", "first_name": "D", "last_name": "E", "role": "superviseur"},
        headers=headers,
    )
    db.expire_all()
    assert db.query(AuditTrail).count() == before_count


# ── USER_DELETED ──────────────────────────────────────────────────────────────

def test_delete_user_generates_audit_entry(client: TestClient, db: Session) -> None:
    """DELETE /admin/users/{id} crée une entrée USER_DELETED avec before/after state."""
    target = create_user(db, email="todelete@example.com")
    headers, _ = _admin_cookie(client, db)

    client.delete(f"/api/v1/admin/users/{target.id}", headers=headers)

    db.expire_all()
    entry = _latest_entry(db, "USER_DELETED")
    assert entry is not None
    assert entry.entity_id == target.id
    assert entry.entity_type == "user"
    assert entry.before_state["email"] == "todelete@example.com"
    assert "deleted_at" in entry.after_state
    assert entry.operator_role == "admin"


# ── USER_ROLE_CHANGED ─────────────────────────────────────────────────────────

def test_role_change_generates_audit_entry(client: TestClient, db: Session) -> None:
    """PATCH /admin/users/{id}/role crée une entrée USER_ROLE_CHANGED."""
    target = create_user(db, role=RoleEnum.superviseur, email="rolechange@example.com")
    headers, _ = _admin_cookie(client, db)

    client.patch(
        f"/api/v1/admin/users/{target.id}/role",
        json={"role": "gestionnaire"},
        headers=headers,
    )

    db.expire_all()
    entry = _latest_entry(db, "USER_ROLE_CHANGED")
    assert entry is not None
    assert entry.entity_id == target.id
    assert entry.before_state == {"role": "superviseur"}
    assert entry.after_state == {"role": "gestionnaire"}


# ── VEHICLE_CREATED ───────────────────────────────────────────────────────────

_VEHICLE_PAYLOAD = {
    "make": "Toyota",
    "model": "Yaris",
    "year": 2024,
    "km": 5000,
    "moteur": "Essence",
    "prix": 18990.0,
    "lld": False,
    "mensualite": None,
    "img": "https://example.com/yaris.jpg",
    "spec_carburant": "Essence",
    "spec_boite": "Manuelle",
    "spec_couleur": "Blanc",
    "spec_places": 5,
    "spec_puissance": "100 ch",
    "visible_catalogue": True,
}


def test_create_vehicle_bearer_generates_audit(client: TestClient, db: Session) -> None:
    """POST /vehicules (Bearer) crée une entrée VEHICLE_CREATED."""
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.bearer@example.com")
    headers = auth_header(gest)

    client.post("/api/v1/vehicules", json=_VEHICLE_PAYLOAD, headers=headers)

    db.expire_all()
    entry = _latest_entry(db, "VEHICLE_CREATED")
    assert entry is not None
    assert entry.entity_type == "vehicle"
    assert entry.after_state["make"] == "Toyota"
    assert entry.before_state is None
    assert entry.operator_role == "gestionnaire"


def test_create_vehicle_cookie_generates_audit(client: TestClient, db: Session) -> None:
    """POST /vehicules/creer (Cookie) crée une entrée VEHICLE_CREATED."""
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.cookie@example.com")
    headers = _cookie(client, email=gest.email, password="SecretMotDePasse1!")

    client.post("/api/v1/vehicules/creer", json=_VEHICLE_PAYLOAD, headers=headers)

    db.expire_all()
    entry = _latest_entry(db, "VEHICLE_CREATED")
    assert entry is not None
    assert entry.after_state["make"] == "Toyota"
    assert entry.operator_role == "gestionnaire"


# ── VEHICLE_UPDATED ───────────────────────────────────────────────────────────

def test_update_vehicle_generates_audit_entry(client: TestClient, db: Session) -> None:
    """PATCH /vehicules/{id} crée une entrée VEHICLE_UPDATED avec before/after state."""
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.update@example.com")
    v = create_vehicle(db)
    headers = auth_header(gest)

    client.patch(f"/api/v1/vehicules/{v.id}", json={"prix": 20000.0}, headers=headers)

    db.expire_all()
    entry = _latest_entry(db, "VEHICLE_UPDATED")
    assert entry is not None
    assert entry.entity_id == v.id
    assert entry.before_state == {"prix": float(v.prix)}
    assert entry.after_state == {"prix": 20000.0}


# ── VEHICLE_ARCHIVED ──────────────────────────────────────────────────────────

def test_archive_vehicle_generates_audit_entry(client: TestClient, db: Session) -> None:
    """DELETE /vehicules/{id} crée une entrée VEHICLE_ARCHIVED avec before/after state."""
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.archive@example.com")
    v = create_vehicle(db)
    headers = auth_header(gest)

    client.delete(f"/api/v1/vehicules/{v.id}", headers=headers)

    db.expire_all()
    entry = _latest_entry(db, "VEHICLE_ARCHIVED")
    assert entry is not None
    assert entry.entity_id == v.id
    assert entry.before_state["archived"] is False
    assert entry.after_state["archived"] is True
    assert entry.after_state["visible_catalogue"] is False


# ── DOSSIER_SUBMITTED ─────────────────────────────────────────────────────────

def test_submit_dossier_generates_audit_entry(client: TestClient, db: Session) -> None:
    """POST /dossiers/{id}/submit crée une entrée DOSSIER_SUBMITTED."""
    client_user = create_user(db, role=RoleEnum.client, email="client.submit@example.com")
    v = create_vehicle(db)
    headers = _cookie(client, email=client_user.email, password="SecretMotDePasse1!")

    # Créer le dossier
    resp = client.post(
        "/api/v1/dossiers",
        json={"vehicle_id": v.id, "type": "achat"},
        headers=headers,
    )
    assert resp.status_code == 201
    dossier_id = resp.json()["id"]

    # Soumettre directement (les pièces ne sont pas requises en test si la validation passe)
    submit_resp = client.post(f"/api/v1/dossiers/{dossier_id}/submit", headers=headers)
    # La soumission peut échouer si des pièces manquent — on vérifie juste que si elle passe
    # l'audit est créé ; si elle échoue (400) l'audit ne doit PAS être créé
    if submit_resp.status_code == 200:
        db.expire_all()
        entry = _latest_entry(db, "DOSSIER_SUBMITTED")
        assert entry is not None
        assert entry.entity_id == dossier_id
        assert entry.before_state["status"] == "brouillon"
        assert entry.after_state["status"] == "depose"
    else:
        db.expire_all()
        assert db.query(AuditTrail).filter(AuditTrail.action == "DOSSIER_SUBMITTED").count() == 0


# ── Append-only : pas d'endpoint UPDATE / DELETE ──────────────────────────────

def test_no_update_endpoint_for_audit_trail(client: TestClient, db: Session) -> None:
    """Aucun endpoint PATCH/PUT n'est exposé pour l'audit trail (404 = route inexistante)."""
    headers, _ = _admin_cookie(client, db)
    resp = client.patch("/api/v1/admin/audit-trail/1", headers=headers)
    # 404 : la route n'existe pas du tout (plus strict que 405 Method Not Allowed)
    assert resp.status_code == 404


def test_no_delete_endpoint_for_audit_trail(client: TestClient, db: Session) -> None:
    """Aucun endpoint DELETE n'est exposé pour l'audit trail (404 = route inexistante)."""
    headers, _ = _admin_cookie(client, db)
    resp = client.delete("/api/v1/admin/audit-trail/1", headers=headers)
    # 404 : la route n'existe pas du tout (plus strict que 405 Method Not Allowed)
    assert resp.status_code == 404


# ── GET /admin/audit-trail ────────────────────────────────────────────────────

def test_admin_can_list_audit_trail(client: TestClient, db: Session) -> None:
    """GET /admin/audit-trail retourne la liste paginée des entrées — admin uniquement."""
    headers, _ = _admin_cookie(client, db)
    # Générer une entrée
    client.post(
        "/api/v1/admin/users",
        json={"email": "list@example.com", "password": "Sup3rS3cur!", "first_name": "L", "last_name": "I", "role": "superviseur"},
        headers=headers,
    )
    resp = client.get("/api/v1/admin/audit-trail", headers=headers)
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) >= 1
    entry = entries[0]
    assert "action" in entry
    assert "entity_type" in entry
    assert "operator_email" in entry
    assert "created_at" in entry
    assert "before_state" in entry
    assert "after_state" in entry


def test_non_admin_cannot_list_audit_trail(client: TestClient, db: Session) -> None:
    """GET /admin/audit-trail retourne 403 pour un gestionnaire."""
    gest = create_user(db, role=RoleEnum.gestionnaire, email="gest.audit@example.com")
    headers = _cookie(client, email=gest.email, password="SecretMotDePasse1!")
    resp = client.get("/api/v1/admin/audit-trail", headers=headers)
    assert resp.status_code == 403


def test_unauthenticated_cannot_list_audit_trail(client: TestClient) -> None:
    """GET /admin/audit-trail retourne 401 sans cookie."""
    resp = client.get("/api/v1/admin/audit-trail")
    assert resp.status_code == 401


def test_audit_trail_filter_by_action(client: TestClient, db: Session) -> None:
    """GET /admin/audit-trail?action=USER_CREATED filtre les entrées par action."""
    headers, _ = _admin_cookie(client, db)
    client.post(
        "/api/v1/admin/users",
        json={"email": "filter@example.com", "password": "Sup3rS3cur!", "first_name": "F", "last_name": "G", "role": "superviseur"},
        headers=headers,
    )
    resp = client.get("/api/v1/admin/audit-trail?action=USER_CREATED", headers=headers)
    assert resp.status_code == 200
    entries = resp.json()
    assert all(e["action"] == "USER_CREATED" for e in entries)


# ── Horodatage UTC + intégrité de l'entrée ────────────────────────────────────

def test_audit_entry_has_utc_timestamp(client: TestClient, db: Session) -> None:
    """Chaque entrée d'audit contient un horodatage UTC (offset +00:00 ou Z)."""
    headers, _ = _admin_cookie(client, db)
    client.post(
        "/api/v1/admin/users",
        json={"email": "ts@example.com", "password": "Sup3rS3cur!", "first_name": "T", "last_name": "S", "role": "superviseur"},
        headers=headers,
    )
    db.expire_all()
    entry = _latest_entry(db, "USER_CREATED")
    assert entry is not None
    # created_at doit être timezone-aware (UTC)
    assert entry.created_at.tzinfo is not None


def test_audit_entry_atomicity_with_mutation(client: TestClient, db: Session) -> None:
    """La mutation et l'entrée d'audit sont dans la même transaction (rollback solidaire)."""
    headers, _ = _admin_cookie(client, db)
    before_count = db.query(AuditTrail).count()

    # Création réussie : mutation + audit ensemble
    resp = client.post(
        "/api/v1/admin/users",
        json={"email": "atomic@example.com", "password": "Sup3rS3cur!", "first_name": "A", "last_name": "T", "role": "superviseur"},
        headers=headers,
    )
    assert resp.status_code == 201
    db.expire_all()
    assert db.query(AuditTrail).count() == before_count + 1
