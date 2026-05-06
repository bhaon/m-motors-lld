"""Service d'envoi d'emails transactionnels via Resend."""

from __future__ import annotations

import logging

import resend

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
