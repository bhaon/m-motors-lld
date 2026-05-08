"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

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
 * Résout l'URL backend de suppression d'un dossier.
 */
function resolveDossierDeleteUrl(id: number): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  const path = `/api/v1/dossiers/${id}`;
  return base ? `${base}${path}` : path;
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
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  /**
   * Supprime un dossier en brouillon puis recharge la liste.
   */
  async function deleteDossier(dossierId: number) {
    setError("");
    setDeletingId(dossierId);
    try {
      const response = await fetch(resolveDossierDeleteUrl(dossierId), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Suppression impossible.");
      }
      setItems((previous) => previous.filter((item) => item.id !== dossierId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main>
      <Navbar />
      <section style={{ maxWidth: 980, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
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
                    <th style={{ textAlign: "left", padding: ".8rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: ".8rem", fontWeight: 700 }}>
                        <Link href={`/mes-dossiers/${item.id}`} style={{ color: "var(--navy)", textDecoration: "underline" }}>
                          {item.reference}
                        </Link>
                      </td>
                      <td style={{ padding: ".8rem", textTransform: "uppercase" }}>{item.type}</td>
                      <td style={{ padding: ".8rem" }}>{item.status}</td>
                      <td style={{ padding: ".8rem" }}>{formatFrenchDate(item.created_at)}</td>
                      <td style={{ padding: ".8rem" }}>
                        {item.status === "brouillon" ? (
                          <button
                            type="button"
                            onClick={() => deleteDossier(item.id)}
                            disabled={deletingId === item.id}
                            style={{
                              background: deletingId === item.id ? "#9ca3af" : "#b91c1c",
                              color: "#fff",
                              border: 0,
                              borderRadius: 8,
                              padding: ".45rem .7rem",
                              cursor: deletingId === item.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {deletingId === item.id ? "Suppression..." : "Supprimer"}
                          </button>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </main>
  );
}
