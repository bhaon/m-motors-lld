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
 * Résout l’URL de l’API catalogue selon l’environnement d’exécution.
 *
 * - **Navigateur** : utilise `NEXT_PUBLIC_API_URL` (injecté au build), ou chemin relatif
 *   `/api/v1/vehicules` proxié par Next.js vers le backend via `rewrites` dans next.config.js.
 * - **SSR (Node.js)** : préfère `API_INTERNAL_URL` (résolution interne Docker/K8s, ex: `http://backend`).
 *   Tombe sur `NEXT_PUBLIC_API_URL` en `next dev`. Sinon, défaut prod ou localhost.
 *
 * Pourquoi ne pas toujours utiliser `NEXT_PUBLIC_API_URL` en SSR ?
 * En conteneur, `localhost` désigne le frontend lui-même, pas le backend.
 * `API_INTERNAL_URL` pointe sur le nom de service Docker/K8s (`http://backend`).
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
