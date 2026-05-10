import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Résout l'URL backend de l'endpoint d'authentification courante.
 */
function resolveMeUrl(): string {
  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) return `${internal.replace(/\/$/, "")}/api/v1/auth/me`;

  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) return `${pub.replace(/\/$/, "")}/api/v1/auth/me`;

  const serverBase = process.env.NODE_ENV === "production" ? "http://backend" : "http://127.0.0.1:8000";
  return `${serverBase}/api/v1/auth/me`;
}

/**
 * Vérifie l'authentification en backend à partir du cookie HTTP-only.
 */
type CurrentUser = {
  id: number;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
};

async function ensureAuthenticatedOrRedirect(): Promise<CurrentUser> {
  const cookieHeader = (await headers()).get("cookie") || "";
  const response = await fetch(resolveMeUrl(), {
    method: "GET",
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    redirect("/?connexion=1");
  }
  return (await response.json()) as CurrentUser;
}

/**
 * L’édition du profil se fait dans une modale (navbar) ; cette route garde les anciens liens
 * et ouvre le profil sur l’accueil.
 */
export default async function EspaceClientPage() {
  await ensureAuthenticatedOrRedirect();
  redirect("/?profil=1");
}
