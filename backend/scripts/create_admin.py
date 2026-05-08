"""
Script de création d'un compte administrateur M-Motors.

Usage :
    # Mode interactif (prompt)
    python scripts/create_admin.py

    # Mode non-interactif (CI/CD, provisioning)
    python scripts/create_admin.py \\
        --email admin@mmotors.fr \\
        --password "Adm1n!S3cure" \\
        --first-name Admin \\
        --last-name "M-Motors"

Options :
    --email        Email du compte administrateur (unique)
    --password     Mot de passe (min 8 cars, 1 maj, 1 chiffre, 1 spécial)
    --first-name   Prénom
    --last-name    Nom de famille
    --force        Met à jour le rôle si le compte existe déjà
"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import sys
from datetime import date, datetime, timezone

_PASSWORD_RE = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*\-_+=?]).{8,}$")


def _validate_password(password: str) -> str:
    """Vérifie la complexité du mot de passe et retourne le mot de passe si valide."""
    if not _PASSWORD_RE.match(password):
        raise ValueError(
            "Mot de passe trop faible. Requis : 8 caractères minimum, "
            "1 majuscule, 1 chiffre, 1 caractère spécial (!@#$%^&*-_+=?)."
        )
    return password


def _prompt_field(label: str, *, secret: bool = False, default: str | None = None) -> str:
    """Affiche un prompt et retourne la valeur saisie (non vide)."""
    hint = f" [{default}]" if default else ""
    while True:
        if secret:
            value = getpass.getpass(f"{label}{hint} : ")
        else:
            value = input(f"{label}{hint} : ").strip()
        if not value and default:
            return default
        if value:
            return value
        print("  Ce champ est obligatoire.")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crée ou met à jour un compte administrateur M-Motors.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--email", help="Email du compte administrateur")
    parser.add_argument("--password", help="Mot de passe (en clair, hashé avant stockage)")
    parser.add_argument("--first-name", dest="first_name", help="Prénom")
    parser.add_argument("--last-name", dest="last_name", help="Nom de famille")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Met à jour le rôle admin si le compte existe déjà (ne change pas le mot de passe)",
    )
    return parser.parse_args()


def _collect_fields(args: argparse.Namespace) -> dict[str, str]:
    """Collecte les champs manquants via prompt interactif."""
    print("\n── Création d'un compte administrateur M-Motors ──\n")
    email = args.email or _prompt_field("Email")
    first_name = args.first_name or _prompt_field("Prénom")
    last_name = args.last_name or _prompt_field("Nom de famille")

    if args.password:
        password = args.password
    else:
        while True:
            password = _prompt_field("Mot de passe", secret=True)
            confirm = _prompt_field("Confirmer le mot de passe", secret=True)
            if password != confirm:
                print("  Les mots de passe ne correspondent pas. Recommencez.\n")
                continue
            break

    return {
        "email": email,
        "password": password,
        "first_name": first_name,
        "last_name": last_name,
    }


def _load_app() -> None:
    """Charge le projet FastAPI dans le path Python (imports différés après --help)."""
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    try:
        import app.models.dossier  # noqa
        import app.models.user  # noqa
        import app.models.vehicle  # noqa
    except Exception as exc:
        print(f"\n❌ Impossible de charger l'application : {exc}")
        print("   Assurez-vous de lancer ce script depuis le répertoire backend/")
        print("   et que les variables d'environnement (SECRET_KEY, DATABASE_URL) sont définies.")
        sys.exit(1)


def create_admin(
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    force: bool = False,
) -> None:
    """Crée ou met à jour le compte administrateur en base."""
    _load_app()

    from app.core.security import hash_password
    from app.db.session import SessionLocal
    from app.models.user import RoleEnum, User

    try:
        _validate_password(password)
    except ValueError as exc:
        print(f"\n❌ {exc}")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()

        if existing:
            if existing.deleted_at is not None:
                print(f"\n❌ Un compte supprimé (soft-delete) existe déjà pour {email}.")
                print("   Restaurez le compte manuellement ou utilisez une autre adresse.")
                sys.exit(1)

            if existing.role == RoleEnum.admin and not force:
                print(f"\n✓ Le compte {email} est déjà administrateur. Aucune modification.")
                return

            if not force:
                print(f"\n⚠  Un compte existe déjà pour {email} (rôle : {existing.role.value}).")
                print("   Utilisez --force pour lui attribuer le rôle admin.")
                sys.exit(1)

            old_role = existing.role.value
            existing.role = RoleEnum.admin
            db.commit()
            print(f"\n✅ Rôle mis à jour : {email} ({old_role} → admin)")
            return

        user = User(
            email=email,
            hashed_password=hash_password(password),
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            birth_date=date(1990, 1, 1),
            role=RoleEnum.admin,
            is_active=True,
            email_verified=True,
            cgu_accepted_at=datetime.now(timezone.utc),
            privacy_accepted_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"\n✅ Administrateur créé : {email} (id={user.id})")

    except Exception as exc:
        db.rollback()
        print(f"\n❌ Erreur lors de la création : {exc}")
        sys.exit(1)
    finally:
        db.close()


def main() -> None:
    args = _parse_args()
    fields = _collect_fields(args)
    create_admin(**fields, force=args.force)


if __name__ == "__main__":
    main()
