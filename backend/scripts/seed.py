"""
Seed script — insère les véhicules M-Motors depuis scripts/vehicles.json.
Run depuis la racine backend : python scripts/seed.py
"""

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.vehicle import Vehicle, VehicleOption, MoteurEnum
from app.models.user import User, RoleEnum
from app.core.security import hash_password

import app.models.vehicle  # noqa
import app.models.user  # noqa

SCRIPTS_DIR = Path(__file__).resolve().parent
VEHICLES_JSON_PATH = SCRIPTS_DIR / "vehicles.json"

_OPTION_SURCHARGE_RE = re.compile(r"\+(\d+)€")


def load_vehicles_from_json(path: Path) -> list[dict]:
    """Charge et parse le fichier JSON catalogue (répertoire scripts)."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def option_surcharge_from_label(p: str) -> float:
    """Extrait le montant mensuel (€) depuis une étiquette du type '+39€/mois'."""
    m = _OPTION_SURCHARGE_RE.search(p)
    return float(m.group(1)) if m else 0.0


def json_row_to_vehicle_kwargs(row: dict) -> dict:
    """Transforme une entrée JSON (specs imbriqués) en kwargs du modèle SQLAlchemy Vehicle."""
    specs = row["specs"]
    return dict(
        id=row["id"],
        make=row["make"],
        model=row["model"],
        year=row["year"],
        km=row["km"],
        moteur=MoteurEnum(row["moteur"]),
        prix=row["prix"],
        lld=row["lld"],
        mensualite=row["mensualite"],
        img=row["img"],
        spec_carburant=specs["carburant"],
        spec_boite=specs["boite"],
        spec_couleur=specs["couleur"],
        spec_places=specs["places"],
        spec_puissance=specs["puissance"],
        visible_catalogue=True,
        archived=False,
    )


USERS_DATA = [
    dict(
        email="admin@mmotors.fr", password="Admin1234!", first_name="Admin", last_name="M-Motors", role=RoleEnum.admin
    ),
    dict(
        email="gestionnaire@mmotors.fr",
        password="Gest1234!",
        first_name="Sophie",
        last_name="Martin",
        role=RoleEnum.gestionnaire,
    ),
    dict(
        email="superviseur@mmotors.fr",
        password="Sup1234!",
        first_name="Marc",
        last_name="Dupont",
        role=RoleEnum.superviseur,
    ),
    dict(
        email="client@mmotors.fr", password="Client1234!", first_name="Jean", last_name="Durand", role=RoleEnum.client
    ),
]


def seed():
    """Insère le jeu de données si les tables existent déjà (migrations appliquées)."""
    db = SessionLocal()
    try:
        if not VEHICLES_JSON_PATH.is_file():
            raise FileNotFoundError(f"Fichier catalogue introuvable : {VEHICLES_JSON_PATH}")

        vehicles_rows = load_vehicles_from_json(VEHICLES_JSON_PATH)

        # Vehicles
        if db.query(Vehicle).count() == 0:
            for row in vehicles_rows:
                options = row["options"]
                v = Vehicle(**json_row_to_vehicle_kwargs(row))
                db.add(v)
                db.flush()
                for opt in options:
                    db.add(
                        VehicleOption(
                            vehicle_id=v.id,
                            name=opt["n"],
                            surcharge=option_surcharge_from_label(opt["p"]),
                        )
                    )
            bind = db.get_bind()
            if bind.dialect.name == "postgresql":
                db.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence('vehicles','id'), "
                        "(SELECT COALESCE(MAX(id), 1) FROM vehicles))"
                    )
                )
            print(f"✓ {len(vehicles_rows)} véhicules insérés depuis {VEHICLES_JSON_PATH.name}")
        else:
            print("→ Véhicules déjà présents, seed ignoré")

        # Users
        if db.query(User).count() == 0:
            for data in USERS_DATA:
                pwd = data.pop("password")
                u = User(hashed_password=hash_password(pwd), is_active=True, email_verified=True, **data)
                db.add(u)
            print(f"✓ {len(USERS_DATA)} utilisateurs créés")
        else:
            print("→ Utilisateurs déjà présents, seed ignoré")

        db.commit()
        print("\n✅ Seed terminé")
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur : {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
