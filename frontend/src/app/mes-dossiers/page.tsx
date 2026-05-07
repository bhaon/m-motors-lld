"use client";

import { useEffect, useState } from "react";

interface DossierItem {
  id: number;
  reference: string;
  type: "achat" | "lld";
  status: string;
  created_at?: string | null;
}

/**
 * Résout l'URL backend de listing des dossiers du client connecté.
 */
function resolveDossiersMeUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/me` : "/api/v1/dossiers/me";
}

/**
 * Formate une date ISO en français (fallback tiret en cas de valeur absente).
 */
function formatFrenchDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Page de gestion des dossiers : affiche la liste des dossiers du client connecté.
 */
export default function MesDossiersPage() {
  const [items, setItems] = useState<DossierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Charge la liste des dossiers client via l'API sécurisée par cookie.
   */
  async function loadMyDossiers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(resolveDossiersMeUrl(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Impossible de charger vos dossiers.");
      }
      const payload = (await response.json()) as DossierItem[];
      setItems(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMyDossiers();
  }, []);

  return (
    <main style={{ maxWidth: 980, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: ".4rem" }}>Mes dossiers</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Retrouvez ici tous les dossiers créés depuis votre espace client.
      </p>

      {loading ? <p>Chargement des dossiers...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error ? (
        items.length === 0 ? (
          <p>Aucun dossier trouvé pour votre compte.</p>
        ) : (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(15,23,42,.04)" }}>
                  <th style={{ textAlign: "left", padding: ".8rem" }}>Référence</th>
                  <th style={{ textAlign: "left", padding: ".8rem" }}>Type</th>
                  <th style={{ textAlign: "left", padding: ".8rem" }}>Statut</th>
                  <th style={{ textAlign: "left", padding: ".8rem" }}>Créé le</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: ".8rem", fontWeight: 700 }}>{item.reference}</td>
                    <td style={{ padding: ".8rem", textTransform: "uppercase" }}>{item.type}</td>
                    <td style={{ padding: ".8rem" }}>{item.status}</td>
                    <td style={{ padding: ".8rem" }}>{formatFrenchDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </main>
  );
}
