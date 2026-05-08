"""Tests des rappels email pour dossiers brouillon non soumis (US-03-05)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.dossier import Dossier, DossierStatusEnum, DossierTypeEnum
from app.services import draft_reminders as draft_reminders_service
from app.services.emailing import send_draft_reminder_email
from tests.conftest import create_user, create_vehicle


def _make_stale_brouillon(
    db: Session,
    *,
    days_old: int,
    reminder_sent: bool = False,
    status: DossierStatusEnum = DossierStatusEnum.brouillon,
) -> tuple[Dossier, str]:
    """Crée un dossier avec une date de création contrôlée et retourne (dossier, email_client)."""
    user = create_user(db, email="client.reminder@example.com")
    vehicle = create_vehicle(db, lld=True)
    now = datetime.now(timezone.utc)
    created = now - timedelta(days=days_old)
    d = Dossier(
        reference=f"DOS-STALE-{days_old}-{user.id}",
        type=DossierTypeEnum.achat,
        status=status,
        client_id=user.id,
        vehicle_id=vehicle.id,
        created_at=created,
        updated_at=created,
        draft_reminder_sent_at=now - timedelta(days=1) if reminder_sent else None,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d, user.email


def test_no_reminder_when_draft_younger_than_threshold(db: Session, monkeypatch) -> None:
    """N'envoie pas de rappel tant que le brouillon a moins de 30 jours."""
    calls: list[object] = []

    def _no_send(**_: object) -> bool:
        """Si appelé par erreur, simule un envoi en échec et enregistre l'appel."""
        calls.append(True)
        return False

    monkeypatch.setattr(draft_reminders_service, "send_draft_reminder_email", _no_send)
    _make_stale_brouillon(db, days_old=29)

    sent = draft_reminders_service.process_stale_draft_reminders(
        db, now=datetime.now(timezone.utc), stale_after_days=30
    )
    assert sent == 0
    assert calls == []


def test_reminder_sent_and_persisted_for_stale_brouillon(db: Session, monkeypatch) -> None:
    """À J+30, envoie un rappel et persiste draft_reminder_sent_at."""
    captured: dict[str, str] = {}
    dossier, email = _make_stale_brouillon(db, days_old=31)

    def _capture_send(*, to_email: str, dossier_reference: str, mes_dossiers_url: str) -> bool:
        """Enregistre les paramètres d'email pour assertions et simule un envoi réussi."""
        captured["to_email"] = to_email
        captured["dossier_reference"] = dossier_reference
        captured["mes_dossiers_url"] = mes_dossiers_url
        return True

    monkeypatch.setattr(draft_reminders_service, "send_draft_reminder_email", _capture_send)
    frozen_now = datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc)
    sent = draft_reminders_service.process_stale_draft_reminders(
        db, now=frozen_now, stale_after_days=30
    )

    assert sent == 1
    assert captured["to_email"] == email
    assert captured["dossier_reference"] == dossier.reference
    assert captured["mes_dossiers_url"].endswith("/mes-dossiers")

    db.expunge_all()
    reloaded = db.query(Dossier).filter(Dossier.id == dossier.id).one()
    stored = reloaded.draft_reminder_sent_at
    assert stored is not None
    if getattr(stored, "tzinfo", None) is None:
        stored = stored.replace(tzinfo=timezone.utc)
    assert stored == frozen_now


def test_no_second_reminder_once_flag_set(db: Session, monkeypatch) -> None:
    """N'envoie qu'une seule fois le rappel (colonnes draft_reminder_sent_at renseignée)."""
    calls = 0

    def _count_send(**_: object) -> bool:
        nonlocal calls
        calls += 1
        return True

    monkeypatch.setattr(draft_reminders_service, "send_draft_reminder_email", _count_send)
    _make_stale_brouillon(db, days_old=31, reminder_sent=True)

    sent = draft_reminders_service.process_stale_draft_reminders(
        db, now=datetime.now(timezone.utc), stale_after_days=30
    )
    assert sent == 0
    assert calls == 0


def test_skips_non_brouillon_even_if_old(db: Session, monkeypatch) -> None:
    """Ignore les dossiers déjà soumis ou hors statut brouillon."""
    calls = 0

    def _count_send(**_: object) -> bool:
        nonlocal calls
        calls += 1
        return False

    monkeypatch.setattr(draft_reminders_service, "send_draft_reminder_email", _count_send)
    _make_stale_brouillon(db, days_old=31, status=DossierStatusEnum.depose)

    sent = draft_reminders_service.process_stale_draft_reminders(
        db, now=datetime.now(timezone.utc), stale_after_days=30
    )
    assert sent == 0
    assert calls == 0


def test_no_persist_when_email_send_returns_false(db: Session, monkeypatch) -> None:
    """Si l'envoi retourne False, on ne marque pas draft_reminder_sent_at (réessaie au prochain batch)."""
    dossier, _ = _make_stale_brouillon(db, days_old=31)

    def _fail_send(**_: object) -> bool:
        """Simule absence d'envoi effectif."""
        return False

    monkeypatch.setattr(draft_reminders_service, "send_draft_reminder_email", _fail_send)
    sent = draft_reminders_service.process_stale_draft_reminders(
        db, now=datetime.now(timezone.utc), stale_after_days=30
    )
    assert sent == 0
    db.expunge_all()
    reloaded = db.query(Dossier).filter(Dossier.id == dossier.id).one()
    assert reloaded.draft_reminder_sent_at is None


def test_send_draft_reminder_email_skips_when_resend_unconfigured(monkeypatch) -> None:
    """Sans clé API, send_draft_reminder_email journalise sans lever et retourne False."""
    monkeypatch.setattr("app.services.emailing.resend", object())
    monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", "")
    assert (
        send_draft_reminder_email(
            to_email="x@example.com",
            dossier_reference="DOS-1",
            mes_dossiers_url="https://example.com/mes-dossiers",
        )
        is False
    )
