"""Tests unitaires du service d'emailing — notifications de changement de statut (US-04-03)."""

from __future__ import annotations

import logging
import pytest

from app.services.emailing import _build_status_change_email_html, send_status_change_email


class TestBuildStatusChangeEmailHtml:
    """Vérifie le contenu HTML généré pour les notifications de changement de statut."""

    def test_contains_dossier_reference(self) -> None:
        """La référence du dossier apparaît dans le corps de l'email."""
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00042",
            nouveau_status="depose",
            dossier_url="https://app.example.com/mes-dossiers/42",
        )
        assert "DOS-2026-00042" in html

    def test_contains_dossier_url_as_link(self) -> None:
        """L'URL directe vers le dossier est présente dans le template."""
        url = "https://app.netdevops.fr/mes-dossiers/99"
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status="en_instruction",
            dossier_url=url,
        )
        assert url in html

    @pytest.mark.parametrize(
        "status,expected_label",
        [
            ("brouillon", "Brouillon"),
            ("depose", "Déposé"),
            ("en_instruction", "En instruction"),
            ("valide", "Validé"),
            ("rejete", "Rejeté"),
            ("annule", "Annulé"),
        ],
    )
    def test_status_label_displayed_in_french(self, status: str, expected_label: str) -> None:
        """Chaque statut est traduit en français dans l'email."""
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status=status,
            dossier_url="https://app.example.com/mes-dossiers/1",
        )
        assert expected_label in html

    def test_rejection_reason_shown_when_provided(self) -> None:
        """Le motif de rejet est inclus dans un bloc visuel dédié."""
        motif = "Revenus insuffisants pour le contrat demandé"
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status="rejete",
            dossier_url="https://app.example.com/mes-dossiers/1",
            motif_rejet=motif,
        )
        assert motif in html
        assert "Motif de rejet" in html

    def test_no_rejection_block_when_motif_absent(self) -> None:
        """Aucun bloc motif n'apparaît pour les statuts non rejetés."""
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status="valide",
            dossier_url="https://app.example.com/mes-dossiers/1",
            motif_rejet=None,
        )
        assert "Motif de rejet" not in html

    def test_no_rejection_block_when_motif_empty_string(self) -> None:
        """Une chaîne vide pour motif_rejet n'affiche pas non plus le bloc."""
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status="rejete",
            dossier_url="https://app.example.com/mes-dossiers/1",
            motif_rejet="",
        )
        assert "Motif de rejet" not in html

    def test_html_contains_cta_button_text(self) -> None:
        """Le bouton d'appel à l'action 'Voir mon dossier' est présent."""
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status="depose",
            dossier_url="https://app.example.com/mes-dossiers/1",
        )
        assert "Voir mon dossier" in html

    def test_html_contains_mmotors_branding(self) -> None:
        """Le branding M-Motors est présent dans le header."""
        html = _build_status_change_email_html(
            dossier_reference="DOS-2026-00001",
            nouveau_status="depose",
            dossier_url="https://app.example.com/mes-dossiers/1",
        )
        assert "M-" in html
        assert "MOTORS" in html


class TestSendStatusChangeEmail:
    """Vérifie le comportement de la fonction d'envoi de notification de statut."""

    def test_logs_warning_when_resend_package_absent(self, monkeypatch, caplog) -> None:
        """Journalise un warning sans lever d'exception quand le package resend est absent."""
        monkeypatch.setattr("app.services.emailing.resend", None)
        with caplog.at_level(logging.WARNING, logger="app.services.emailing"):
            send_status_change_email(
                to_email="client@example.com",
                dossier_reference="DOS-2026-00001",
                nouveau_status="depose",
                dossier_url="https://app.example.com/mes-dossiers/1",
            )
        assert any("resend" in r.message.lower() for r in caplog.records)

    def test_logs_warning_when_api_key_absent(self, monkeypatch, caplog) -> None:
        """Journalise un warning sans lever d'exception quand RESEND_API_KEY est vide."""
        monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", "")
        with caplog.at_level(logging.WARNING, logger="app.services.emailing"):
            send_status_change_email(
                to_email="client@example.com",
                dossier_reference="DOS-2026-00001",
                nouveau_status="depose",
                dossier_url="https://app.example.com/mes-dossiers/1",
            )
        assert any("absente" in r.message.lower() or "resend_api_key" in r.message.lower() for r in caplog.records)

    def test_logs_warning_when_api_key_none(self, monkeypatch, caplog) -> None:
        """Journalise un warning sans lever d'exception quand RESEND_API_KEY est None."""
        monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", None)
        with caplog.at_level(logging.WARNING, logger="app.services.emailing"):
            send_status_change_email(
                to_email="client@example.com",
                dossier_reference="DOS-2026-00001",
                nouveau_status="valide",
                dossier_url="https://app.example.com/mes-dossiers/1",
            )
        assert len(caplog.records) >= 1

    def test_calls_resend_with_correct_recipient(self, monkeypatch) -> None:
        """Appelle resend.Emails.send avec le bon destinataire."""
        calls: list[dict] = []

        class _FakeResend:
            api_key = None

            class Emails:
                @staticmethod
                def send(payload: dict) -> None:
                    calls.append(payload)

        monkeypatch.setattr("app.services.emailing.resend", _FakeResend)
        monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", "test-key")

        send_status_change_email(
            to_email="client@example.com",
            dossier_reference="DOS-2026-00001",
            nouveau_status="valide",
            dossier_url="https://app.example.com/mes-dossiers/1",
        )

        assert len(calls) == 1
        assert calls[0]["to"] == ["client@example.com"]

    def test_subject_contains_reference_and_french_status(self, monkeypatch) -> None:
        """L'objet de l'email contient la référence du dossier et le statut en français."""
        calls: list[dict] = []

        class _FakeResend:
            api_key = None

            class Emails:
                @staticmethod
                def send(payload: dict) -> None:
                    calls.append(payload)

        monkeypatch.setattr("app.services.emailing.resend", _FakeResend)
        monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", "test-key")

        send_status_change_email(
            to_email="client@example.com",
            dossier_reference="DOS-2026-00001",
            nouveau_status="valide",
            dossier_url="https://app.example.com/mes-dossiers/1",
        )

        subject = calls[0]["subject"]
        assert "DOS-2026-00001" in subject
        assert "Validé" in subject

    def test_sends_rejection_reason_in_html_when_provided(self, monkeypatch) -> None:
        """Le motif de rejet est transmis dans le HTML quand le statut est rejete."""
        calls: list[dict] = []

        class _FakeResend:
            api_key = None

            class Emails:
                @staticmethod
                def send(payload: dict) -> None:
                    calls.append(payload)

        monkeypatch.setattr("app.services.emailing.resend", _FakeResend)
        monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", "test-key")

        send_status_change_email(
            to_email="client@example.com",
            dossier_reference="DOS-2026-00007",
            nouveau_status="rejete",
            dossier_url="https://app.example.com/mes-dossiers/7",
            motif_rejet="Pièce d'identité illisible",
        )

        assert len(calls) == 1
        assert "Pièce d'identité illisible" in calls[0]["html"]
        assert "Motif de rejet" in calls[0]["html"]

    def test_does_not_raise_when_resend_send_fails(self, monkeypatch) -> None:
        """Un échec Resend est journalisé sans propager d'exception."""
        class _FailingResend:
            api_key = None

            class Emails:
                @staticmethod
                def send(payload: dict) -> None:
                    raise ConnectionError("Resend indisponible")

        monkeypatch.setattr("app.services.emailing.resend", _FailingResend)
        monkeypatch.setattr("app.services.emailing.settings.RESEND_API_KEY", "test-key")

        # Ne doit pas lever d'exception
        send_status_change_email(
            to_email="client@example.com",
            dossier_reference="DOS-2026-00001",
            nouveau_status="depose",
            dossier_url="https://app.example.com/mes-dossiers/1",
        )
