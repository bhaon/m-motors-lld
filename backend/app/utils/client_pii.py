"""Utilitaires PII clients (normalisation email, empreinte pour recherche)."""

from __future__ import annotations

import hashlib


def normalized_client_email(email: str) -> str:
    """Retourne l'email normalisé (trim + minuscules) pour hachage ou comparaison logique."""
    return email.strip().lower()


def client_email_search_hash(email: str) -> str:
    """
    Empreinte SHA-256 (hex) de l'email normalisé, pour indexation et recherches sans stocker l'email en clair.
    """
    return hashlib.sha256(normalized_client_email(email).encode("utf-8")).hexdigest()
