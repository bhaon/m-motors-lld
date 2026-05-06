import type { Vehicle } from "@/types";

/**
 * Erreur levée lorsque le catalogue ne peut pas être chargé depuis l’API backend.
 */
export class VehiclesApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "VehiclesApiError";
  }
}

/**
 * Résout l’URL de l’API catalogue (alignée sur les rewrites Next.js pour `/api/*`).
 *
 * - **Navigateur** : `NEXT_PUBLIC_API_URL` si défini, sinon chemin relatif `/api/v1/vehicules`.
 * - **SSR (Node)** : `API_INTERNAL_URL` en premier (K8s / Docker : `http://backend`), puis
 *   `NEXT_PUBLIC_API_URL` pour un `next dev` sur la machine hôte. Sinon défaut prod / local.
 *
 * En conteneur, `NEXT_PUBLIC_API_URL=http://localhost:8000` ne doit pas primer : pour le serveur
 * Node, localhost est le conteneur frontend, pas l’API.
 *
 * @returns {string} URL absolue ou chemin relatif pour fetch.
 */
function resolveVehiclesApiUrl(): string {
  if (globalThis.window !== undefined) {
    const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (pub) return `${pub.replace(/\/$/, "")}/api/v1/vehicules`;
    return "/api/v1/vehicules";
  }

  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) return `${internal.replace(/\/$/, "")}/api/v1/vehicules`;

  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) return `${pub.replace(/\/$/, "")}/api/v1/vehicules`;

  const serverBase =
    process.env.NODE_ENV === "production"
      ? "http://backend"
      : "http://127.0.0.1:8000";
  return `${serverBase}/api/v1/vehicules`;
}

/**
 * Récupère le catalogue depuis le backend uniquement (aucune donnée locale de secours).
 * Une base neuve renvoie souvent `items: []` : ce cas est valide et retourne un tableau vide.
 *
 * @throws {VehiclesApiError} uniquement en cas d’échec réseau ou HTTP non 2xx
 */
export async function fetchVehicles(): Promise<Vehicle[]> {
  try {
    const response = await fetch(resolveVehiclesApiUrl(), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new VehiclesApiError(
        `Impossible de charger le catalogue (HTTP ${response.status}).`,
        response.status,
      );
    }

    const payload = (await response.json()) as { items?: Vehicle[] };
    return payload.items ?? [];
  } catch (e) {
    if (e instanceof VehiclesApiError) throw e;
    throw new VehiclesApiError(
      e instanceof Error
        ? e.message
        : "Erreur lors du chargement du catalogue.",
    );
  }
}
