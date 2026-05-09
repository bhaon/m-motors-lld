/**
 * Résout l’origine de l’API (même logique que le catalogue : navigateur vs SSR Node).
 * Chaîne vide = même origine (rewrite Next.js).
 */
function resolveApiOrigin(): string {
  if (globalThis.window !== undefined) {
    const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
    return pub ? pub.replace(/\/$/, "") : "";
  }

  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) return internal.replace(/\/$/, "");

  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) return pub.replace(/\/$/, "");

  return process.env.NODE_ENV === "production" ? "http://backend" : "http://127.0.0.1:8000";
}

/**
 * Retourne l’URL complète d’un chemin API (ex. `/api/v1/dossiers/1`). 
 */
export function apiUrl(path: string): string {
  const origin = resolveApiOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Base HTTP(S) du backend sans slash final ; utile pour concaténer `/api/v1/...`.
 */
export function apiBase(): string {
  return resolveApiOrigin();
}
