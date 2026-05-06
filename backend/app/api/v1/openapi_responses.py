"""Aide à remplir le paramètre ``responses=`` des décorateurs de route (OpenAPI / Swagger)."""

from typing import Any

# Fragment attendu par FastAPI pour le paramètre ``responses`` des routes.
OpenAPIResponseFragment = dict[int | str, dict[str, Any]]


def openapi_http_error(status_code: int, description: str, detail_example: str) -> OpenAPIResponseFragment:
    """
    Retourne un fragment ``{status_code: {...}}`` pour documenter une réponse d'erreur
    au format FastAPI ``{"detail": "..."}``.
    """
    body: dict[str, Any] = {
        "description": description,
        "content": {
            "application/json": {
                "example": {"detail": detail_example},
            },
        },
    }
    return {status_code: body}
