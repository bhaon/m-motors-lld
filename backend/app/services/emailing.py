"""Service d'envoi d'emails transactionnels via Resend."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

try:
    import resend
except ModuleNotFoundError:  # pragma: no cover - dépend de l'environnement runtime
    resend = None  # type: ignore[assignment]

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_verification_email_html(confirmation_link: str) -> str:
    """Construit le HTML branding M-Motors de l'email de vérification."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Confirmez votre adresse email</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Merci pour votre inscription. Pour activer votre compte, cliquez sur le bouton ci-dessous.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563;">
              Le lien de confirmation est valide pendant 24 heures.
            </p>
            <a
              href="{confirmation_link}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Confirmer mon email
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{confirmation_link}" style="color:#0369a1;text-decoration:underline;">{confirmation_link}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_verification_email(*, to_email: str, confirmation_link: str) -> None:
    """Envoie l'email de vérification via Resend quand la clé API est configurée."""
    if resend is None:
        logger.warning("Package resend absent : email de vérification non envoyé pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email de vérification non envoyé pour %s", to_email)
        return

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send(
        {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "Confirmez votre email M-Motors",
            "html": _build_verification_email_html(confirmation_link),
        }
    )


def _build_password_reset_email_html(reset_link: str) -> str:
    """Construit le HTML branding M-Motors de l'email de réinitialisation."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Réinitialisez votre mot de passe</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Vous avez demandé la réinitialisation de votre mot de passe.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563;">
              Le lien de réinitialisation est valide pendant 1 heure.
            </p>
            <a
              href="{reset_link}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Réinitialiser mon mot de passe
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{reset_link}" style="color:#0369a1;text-decoration:underline;">{reset_link}</a>
            </p>
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_password_reset_email(*, to_email: str, reset_link: str) -> None:
    """Envoie l'email de réinitialisation via Resend quand la clé API est configurée."""
    if resend is None:
        logger.warning("Package resend absent : email de reset non envoyé pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email de reset non envoyé pour %s", to_email)
        return

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send(
        {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "Réinitialisation de votre mot de passe M-Motors",
            "html": _build_password_reset_email_html(reset_link),
        }
    )


def _build_dossier_submission_email_html(*, dossier_reference: str, submitted_at_utc_iso: str) -> str:
    """Construit le HTML de confirmation de dépôt de dossier côté client."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Votre dossier a bien ete depose</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Nous confirmons la reception de votre dossier <strong>{dossier_reference}</strong>.
            </p>
            <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563;">
              Date de soumission (UTC): <strong>{submitted_at_utc_iso}</strong>
            </p>
            <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b5563;">
              Votre demande est transmise a l'equipe de traitement.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a ete envoye automatiquement, merci de ne pas y repondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def _build_draft_reminder_email_html(*, dossier_reference: str, mes_dossiers_url: str) -> str:
    """Construit le HTML du rappel pour finaliser un dossier resté en brouillon."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Votre dossier attend d'être finalisé</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Le dossier <strong>{dossier_reference}</strong> est encore enregistré en brouillon et n'a pas encore été soumis.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563;">
              Vous pouvez reprendre la saisie et le compléter quand vous le souhaitez depuis votre espace client.
            </p>
            <a
              href="{mes_dossiers_url}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Accéder à mes dossiers
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{mes_dossiers_url}" style="color:#0369a1;text-decoration:underline;">{mes_dossiers_url}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_draft_reminder_email(*, to_email: str, dossier_reference: str, mes_dossiers_url: str) -> bool:
    """
    Envoie le rappel de finalisation pour un dossier brouillon via Resend quand la clé API est disponible.

    Renvoie ``True`` si l'email a bien été envoyé via Resend, ``False`` sinon (pour réessayer plus tard).
    """
    if resend is None:
        logger.warning("Package resend absent : email de rappel brouillon non envoye pour %s", to_email)
        return False
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email de rappel brouillon non envoye pour %s", to_email)
        return False

    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Rappel : finalisez votre dossier M-Motors",
                "html": _build_draft_reminder_email_html(
                    dossier_reference=dossier_reference,
                    mes_dossiers_url=mes_dossiers_url,
                ),
            }
        )
    except Exception:  # pragma: no cover - dépend du réseau / API Resend
        logger.exception("Echec d'envoi Resend pour le rappel brouillon (dossier %s)", dossier_reference)
        return False
    return True


def send_dossier_submission_email(*, to_email: str, dossier_reference: str, submitted_at_utc_iso: str) -> None:
    """Envoie l'email de confirmation de dépôt dossier via Resend quand la clé API est configurée."""
    if resend is None:
        logger.warning("Package resend absent : email de depot dossier non envoye pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email de depot dossier non envoye pour %s", to_email)
        return

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send(
        {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "Confirmation de depot de votre dossier M-Motors",
            "html": _build_dossier_submission_email_html(
                dossier_reference=dossier_reference,
                submitted_at_utc_iso=submitted_at_utc_iso,
            ),
        }
    )


# ── US-04-03 : Notification de changement de statut ──────────────────────────

_STATUS_LABELS: dict[str, str] = {
    "brouillon": "Brouillon",
    "depose": "Déposé",
    "en_instruction": "En instruction",
    "valide": "Validé",
    "en_signature": "En signature",
    "attente_livraison": "Attente de livraison",
    "livraison_planifiee": "Livraison planifiée",
    "contrat_en_cours": "Contrat en cours",
    "cloture": "Clôturé",
    "rejete": "Rejeté",
    "annule": "Annulé",
}


def _build_status_change_email_html(
    *,
    dossier_reference: str,
    nouveau_status: str,
    dossier_url: str,
    motif_rejet: str | None = None,
) -> str:
    """Construit le HTML de notification de changement de statut d'un dossier."""
    status_label = _STATUS_LABELS.get(nouveau_status, nouveau_status)
    motif_block = (
        f"""
        <tr>
          <td style="padding:0 24px 20px;">
            <div style="background:#fee2e2;border-left:4px solid #b91c1c;padding:14px 16px;border-radius:0 8px 8px 0;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#b91c1c;">Motif de rejet :</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#7f1d1d;">{motif_rejet}</p>
            </div>
          </td>
        </tr>"""
        if motif_rejet
        else ""
    )
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Mise à jour de votre dossier</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Le statut du dossier <strong>{dossier_reference}</strong> vient d'être mis à jour.
            </p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">
              Nouveau statut : <strong>{status_label}</strong>
            </p>
            <a
              href="{dossier_url}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Voir mon dossier
            </a>
          </td>
        </tr>
        {motif_block}
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{dossier_url}" style="color:#0369a1;text-decoration:underline;">{dossier_url}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_status_change_email(
    *,
    to_email: str,
    dossier_reference: str,
    nouveau_status: str,
    dossier_url: str,
    motif_rejet: str | None = None,
) -> None:
    """Envoie une notification de changement de statut dossier via Resend.

    Conçue pour être appelée à chaque transition de statut. L'échec d'envoi
    est journalisé mais ne propage pas d'exception (non-bloquant).
    """
    if resend is None:
        logger.warning("Package resend absent : notification statut non envoyée pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : notification statut non envoyée pour %s", to_email)
        return

    status_label = _STATUS_LABELS.get(nouveau_status, nouveau_status)
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"Votre dossier {dossier_reference} : {status_label}",
                "html": _build_status_change_email_html(
                    dossier_reference=dossier_reference,
                    nouveau_status=nouveau_status,
                    dossier_url=dossier_url,
                    motif_rejet=motif_rejet,
                ),
            }
        )
    except Exception:  # pragma: no cover - dépend du réseau / API Resend
        logger.exception(
            "Echec Resend notification statut %s pour dossier %s", nouveau_status, dossier_reference
        )


def _build_contract_ready_email_html(*, dossier_reference: str, contrat_url: str) -> str:
    """HTML : dossier validé, contrat à consulter et signer."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Votre dossier est validé — contrat à signer</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Votre dossier <strong>{dossier_reference}</strong> a été validé. Un contrat a été généré : connectez-vous à votre espace
              et ouvrez le dossier pour le consulter et lancer la signature électronique.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563;">
              Le statut de votre dossier est désormais <strong>en signature</strong>.
            </p>
            <a
              href="{contrat_url}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Voir le contrat dans mon dossier
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{contrat_url}" style="color:#0369a1;text-decoration:underline;">{contrat_url}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_contract_ready_email(*, to_email: str, dossier_reference: str, contrat_url: str) -> None:
    """Notifie le client que le contrat est disponible (US-06-07). Non-bloquant si Resend absent."""
    if resend is None:
        logger.warning("Package resend absent : email contrat prêt non envoyé pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email contrat prêt non envoyé pour %s", to_email)
        return
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"Contrat à signer — dossier {dossier_reference}",
                "html": _build_contract_ready_email_html(
                    dossier_reference=dossier_reference,
                    contrat_url=contrat_url,
                ),
            }
        )
    except Exception:  # pragma: no cover
        logger.exception("Echec Resend email contrat prêt pour dossier %s", dossier_reference)


def _build_contract_signature_link_email_html(*, dossier_reference: str, confirmation_link: str) -> str:
    """HTML : lien magique pour confirmer la signature (comme la confirmation email)."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Confirmez votre signature électronique</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Vous avez demandé à signer le contrat pour le dossier <strong>{dossier_reference}</strong>.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563;">
              Cliquez sur le bouton ci-dessous pour valider définitivement votre signature. Lien valable 24 heures.
            </p>
            <a
              href="{confirmation_link}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Valider ma signature
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{confirmation_link}" style="color:#0369a1;text-decoration:underline;">{confirmation_link}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_contract_signature_link_email(*, to_email: str, dossier_reference: str, confirmation_link: str) -> None:
    """Envoie le lien de confirmation de signature (US-06-07)."""
    if resend is None:
        logger.warning("Package resend absent : email signature contrat non envoyé pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email signature contrat non envoyé pour %s", to_email)
        return
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"Confirmez votre signature — dossier {dossier_reference}",
                "html": _build_contract_signature_link_email_html(
                    dossier_reference=dossier_reference,
                    confirmation_link=confirmation_link,
                ),
            }
        )
    except Exception:  # pragma: no cover
        logger.exception("Echec Resend email lien signature dossier %s", dossier_reference)


def _build_avenant_signature_link_email_html(
    *,
    dossier_reference: str,
    avenant_reference: str,
    confirmation_link: str,
) -> str:
    """HTML : lien magique pour signer l’avenant LLD (US-06-08)."""
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Signez votre avenant au contrat</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Un avenant a été généré pour le dossier <strong>{dossier_reference}</strong> — réf. <strong>{avenant_reference}</strong>.
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563;">
              Cliquez sur le bouton pour valider définitivement la modification des options de location. Lien valable 24 heures.
            </p>
            <a
              href="{confirmation_link}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Valider la signature de l&apos;avenant
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{confirmation_link}" style="color:#0369a1;text-decoration:underline;">{confirmation_link}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_avenant_signature_link_email(
    *,
    to_email: str,
    dossier_reference: str,
    avenant_reference: str,
    confirmation_link: str,
) -> None:
    """Envoie le lien de signature d’avenant LLD (US-06-08)."""
    if resend is None:
        logger.warning("Package resend absent : email avenant non envoyé pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email avenant non envoyé pour %s", to_email)
        return
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"Signez votre avenant — {avenant_reference} (dossier {dossier_reference})",
                "html": _build_avenant_signature_link_email_html(
                    dossier_reference=dossier_reference,
                    avenant_reference=avenant_reference,
                    confirmation_link=confirmation_link,
                ),
            }
        )
    except Exception:  # pragma: no cover
        logger.exception("Echec Resend email avenant dossier %s", dossier_reference)


def _format_livraison_prevue_fr(livraison_prevue_at: datetime) -> str:
    """Formate une date/heure UTC pour affichage client (fuseau Europe/Paris)."""
    dt = livraison_prevue_at
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    paris = dt.astimezone(ZoneInfo("Europe/Paris"))
    return paris.strftime("%d/%m/%Y à %H:%M (heure de Paris)")


def _build_livraison_planifiee_email_html(
    *,
    dossier_reference: str,
    livraison_prevue_at: datetime,
    lieu_livraison: str,
    dossier_url: str,
) -> str:
    """HTML US-06-10 : créneau, lieu fixe Garage Gaudin, lien dossier."""
    horaire_txt = _format_livraison_prevue_fr(livraison_prevue_at)
    return f"""
    <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.04em;">
            M-<span style="color:#06b6d4;">MOTORS</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 18px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;">Livraison de votre véhicule planifiée</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
              Concernant le dossier <strong>{dossier_reference}</strong>, votre livraison est planifiée.
            </p>
            <p style="margin:0 0 10px;font-size:15px;line-height:1.6;">
              <strong>Date et heure :</strong> {horaire_txt}
            </p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">
              <strong>Lieu de livraison :</strong> {lieu_livraison}
            </p>
            <a
              href="{dossier_url}"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;"
            >
              Voir mon dossier
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 22px;">
            <p style="margin:14px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
              <a href="{dossier_url}" style="color:#0369a1;text-decoration:underline;">{dossier_url}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
            Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br />
            © M-Motors
          </td>
        </tr>
      </table>
    </div>
    """.strip()


def send_livraison_planifiee_email(
    *,
    to_email: str,
    dossier_reference: str,
    livraison_prevue_at: datetime,
    lieu_livraison: str,
    dossier_url: str,
) -> None:
    """Envoie date/heure/lieu de livraison au client (US-06-10). Non-bloquant sans Resend."""
    if resend is None:
        logger.warning("Package resend absent : email livraison non envoyé pour %s", to_email)
        return
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY absente : email livraison non envoyé pour %s", to_email)
        return
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"Votre livraison — dossier {dossier_reference}",
                "html": _build_livraison_planifiee_email_html(
                    dossier_reference=dossier_reference,
                    livraison_prevue_at=livraison_prevue_at,
                    lieu_livraison=lieu_livraison,
                    dossier_url=dossier_url,
                ),
            }
        )
    except Exception:  # pragma: no cover
        logger.exception("Echec Resend email livraison planifiée dossier %s", dossier_reference)
