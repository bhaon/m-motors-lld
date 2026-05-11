"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import type { DossierListItem, DossierStatus } from "@/types";

function resolveDossiersMeUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/me` : "/api/v1/dossiers/me";
}

function resolveDossierDeleteUrl(id: number): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  const path = `/api/v1/dossiers/${id}`;
  return base ? `${base}${path}` : path;
}

function formatFrenchDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const TYPE_LABEL: Record<string, string> = {
  achat: "Achat",
  lld: "LLD",
};

const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  achat: { color: "var(--navy)", bg: "#e8edf8" },
  lld:   { color: "#0e7490",    bg: "#cffafe" },
};

export default function MesDossiersPage() {
  const [items, setItems] = useState<DossierListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [creationNotice, setCreationNotice] = useState<{
    reference: string;
    dossierType: string;
    dossierId: number;
  } | null>(null);
  const [highlightDossierId, setHighlightDossierId] = useState<number | null>(null);

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
      const payload = (await response.json()) as DossierListItem[];
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

  /** Affiche la confirmation de création après redirection depuis le catalogue, puis nettoie l’URL. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("cree") !== "1") return;
    const reference = (sp.get("ref") || "").trim() || "—";
    const dossierType = (sp.get("type") || "").trim() || "DOSSIER";
    const idRaw = sp.get("id");
    const parsedId = idRaw ? Number.parseInt(idRaw, 10) : NaN;
    const dossierId = Number.isFinite(parsedId) ? parsedId : 0;
    setCreationNotice({ reference, dossierType, dossierId });
    if (dossierId > 0) setHighlightDossierId(dossierId);
    const url = new URL(window.location.href);
    ["cree", "ref", "id", "type"].forEach((k) => url.searchParams.delete(k));
    const next = url.searchParams.toString();
    window.history.replaceState({}, "", next ? `${url.pathname}?${next}` : url.pathname);
  }, []);

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
      setItems((prev: DossierListItem[]) =>
        prev.filter((item: DossierListItem) => item.id !== dossierId)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main>
      <Navbar />

      <section
        style={{
          maxWidth: 1040,
          margin: "2rem auto",
          padding: "0 1rem",
        }}
      >
        {/* En-tête */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1
            style={{
              fontFamily: "Syne, sans-serif",
              fontSize: "1.75rem",
              color: "var(--navy)",
              marginBottom: ".25rem",
            }}
          >
            Mon tableau de bord
          </h1>
          <p style={{ color: "var(--muted)", fontSize: ".95rem" }}>
            Suivez l&apos;état de tous vos dossiers en un coup d&apos;œil.
          </p>
        </div>

        {/* États de chargement / erreur */}
        {loading && (
          <p style={{ color: "var(--muted)" }}>Chargement des dossiers…</p>
        )}
        {error && (
          <p
            role="alert"
            style={{
              color: "#b91c1c",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: ".75rem 1rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </p>
        )}

        {creationNotice && (
          <div
            role="status"
            style={{
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              borderRadius: 10,
              padding: "1rem 1.1rem",
              marginBottom: "1.25rem",
              color: "#065f46",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: ".75rem",
            }}
          >
            <p style={{ margin: 0, lineHeight: 1.55, maxWidth: "52rem" }}>
              <strong>Votre dossier {creationNotice.dossierType}</strong> ({creationNotice.reference}
              ) a été créé.{" "}
              {creationNotice.dossierId > 0 ? (
                <>
                  Cliquez sur la référence ou sur «&nbsp;Voir&nbsp;» dans la ligne correspondante pour continuer à le
                  compléter (pièces justificatives, options, etc.).
                </>
              ) : (
                <>Retrouvez-le dans le tableau ci-dessous et ouvrez-le pour poursuivre la démarche.</>
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setCreationNotice(null);
                setHighlightDossierId(null);
              }}
              style={{
                flexShrink: 0,
                border: "1px solid #059669",
                background: "#fff",
                color: "#047857",
                borderRadius: 8,
                padding: ".35rem .75rem",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: ".82rem",
              }}
            >
              Fermer
            </button>
          </div>
        )}

        {/* Contenu principal */}
        {!loading && !error && (
          <>
            {items.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem 1rem",
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                <p style={{ fontSize: "1.1rem", marginBottom: ".5rem" }}>
                  Aucun dossier pour le moment.
                </p>
                <p style={{ fontSize: ".9rem" }}>
                  Rendez-vous sur le{" "}
                  <Link href="/" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
                    catalogue
                  </Link>{" "}
                  pour déposer votre première demande.
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  boxShadow: "var(--shadow)",
                }}
              >
                <table
                  style={{ width: "100%", borderCollapse: "collapse" }}
                  aria-label="Liste de mes dossiers"
                >
                  <thead>
                    <tr
                      style={{
                        background: "rgba(13,27,75,.04)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {["Référence", "Véhicule", "Type", "Date de création", "Statut", "Actions"].map(
                        (col) => (
                          <th
                            key={col}
                            scope="col"
                            style={{
                              textAlign: "left",
                              padding: ".85rem 1rem",
                              fontFamily: "Syne, sans-serif",
                              fontSize: ".8rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: ".05em",
                              color: "var(--muted)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const typeStyle = TYPE_STYLE[item.type] ?? TYPE_STYLE.achat;
                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderTop: "1px solid var(--border)",
                            transition: "background .15s",
                            background:
                              highlightDossierId !== null && item.id === highlightDossierId
                                ? "rgba(14,116,144,0.1)"
                                : undefined,
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background =
                              highlightDossierId !== null && item.id === highlightDossierId
                                ? "rgba(14,116,144,0.14)"
                                : "rgba(13,27,75,.02)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background =
                              highlightDossierId !== null && item.id === highlightDossierId
                                ? "rgba(14,116,144,0.1)"
                                : "";
                          }}
                        >
                          {/* Référence */}
                          <td style={{ padding: ".85rem 1rem", fontWeight: 700 }}>
                            <Link
                              href={`/mes-dossiers/${item.id}`}
                              style={{
                                color: "var(--navy)",
                                textDecoration: "none",
                                fontFamily: "Syne, sans-serif",
                                fontSize: ".9rem",
                              }}
                              aria-label={`Voir le dossier ${item.reference}`}
                            >
                              {item.reference}
                            </Link>
                          </td>

                          {/* Véhicule */}
                          <td style={{ padding: ".85rem 1rem" }}>
                            <span style={{ fontWeight: 600, color: "var(--navy)" }}>
                              {item.vehicle.make} {item.vehicle.model}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: ".8rem",
                                color: "var(--muted)",
                              }}
                            >
                              {item.vehicle.year}
                            </span>
                          </td>

                          {/* Type */}
                          <td style={{ padding: ".85rem 1rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: ".2rem .65rem",
                                borderRadius: 20,
                                fontSize: ".78rem",
                                fontWeight: 700,
                                color: typeStyle.color,
                                background: typeStyle.bg,
                              }}
                            >
                              {TYPE_LABEL[item.type] ?? item.type.toUpperCase()}
                            </span>
                          </td>

                          {/* Date de création */}
                          <td
                            style={{
                              padding: ".85rem 1rem",
                              color: "var(--muted)",
                              fontSize: ".9rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatFrenchDate(item.created_at)}
                          </td>

                          {/* Statut */}
                          <td style={{ padding: ".85rem 1rem" }}>
                            <StatusBadge status={item.status as DossierStatus} />
                          </td>

                          {/* Actions */}
                          <td style={{ padding: ".85rem 1rem" }}>
                            <Link
                              href={`/mes-dossiers/${item.id}`}
                              style={{
                                display: "inline-block",
                                padding: ".35rem .75rem",
                                borderRadius: 8,
                                fontSize: ".82rem",
                                fontWeight: 600,
                                color: "var(--navy)",
                                background: "#e8edf8",
                                textDecoration: "none",
                                marginRight: ".5rem",
                              }}
                            >
                              Voir
                            </Link>
                            {item.status === "brouillon" && (
                              <button
                                type="button"
                                onClick={() => deleteDossier(item.id)}
                                disabled={deletingId === item.id}
                                style={{
                                  background: deletingId === item.id ? "#9ca3af" : "#b91c1c",
                                  color: "#fff",
                                  border: 0,
                                  borderRadius: 8,
                                  padding: ".35rem .75rem",
                                  fontSize: ".82rem",
                                  fontWeight: 600,
                                  cursor: deletingId === item.id ? "not-allowed" : "pointer",
                                }}
                              >
                                {deletingId === item.id ? "Suppression…" : "Supprimer"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}