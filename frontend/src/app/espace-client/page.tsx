import Navbar from "@/components/Navbar";
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
async function ensureAuthenticatedOrRedirect(): Promise<void> {
  const cookieHeader = (await headers()).get("cookie") || "";
  const response = await fetch(resolveMeUrl(), {
    method: "GET",
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    redirect("/connexion");
  }
}

export default async function EspaceClientPage() {
  await ensureAuthenticatedOrRedirect();

  return (
    <main>
      <Navbar />
      <section style={{ maxWidth: 720, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Espace client</h1>
        <p>Bienvenue dans votre espace personnel. Vos dossiers et contrats seront disponibles ici.</p>
      </section>
    </main>
  );
}
