"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import type { ContratListItem } from "@/types";

function resolveContratsUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/contrats` : "/api/v1/dossiers/contrats";
}

function formatFrenchDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatMensualite(value?: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  const label = isActive ? "Actif" : "Terminé";
  const color = isActive ? "#15803d" : "#374151";
  const bg = isActive ? "#dcfce7" : "#e5e7eb";
  return (
    <span
      role="status"
      aria-label={`Statut contrat : ${label}`}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: ".78rem",
        fontWeight: 700,
        color,
        background: bg,
        letterSpacing: ".02em",
      }}
    >
      {label}
    </span>
  );
}

export default function MesContratsPage() {
  const [items, setItems] = useState<ContratListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(resolveContratsUrl(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(payload.detail || "Impossible de charger vos contrats.");
        }
        return res.json() as Promise<ContratListItem[]>;
      })
      .then((data) => setItems(data))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Erreur inattendue.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            color: "var(--navy)",
            marginBottom: "1.5rem",
          }}
        >
          Mes contrats LLD
        </h1>

        {error && (
          <p role="alert" style={{ color: "#b91c1c", marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        {loading ? (
          <p aria-live="polite">Chargement de vos contrats…</p>
        ) : items.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "3rem 1rem",
              color: "#6b7280",
              background: "#f9fafb",
              borderRadius: 12,
            }}
          >
            <p style={{ fontSize: "1rem", marginBottom: "1rem" }}>
              Vous n&apos;avez pas encore de contrat LLD actif.
            </p>
            <Link
              href="/"
              style={{
                color: "var(--navy)",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Découvrir nos véhicules en LLD
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: ".9rem",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f1f5f9",
                    textAlign: "left",
                    fontWeight: 700,
                    color: "#374151",
                  }}
                >
                  <th style={{ padding: "10px 14px" }}>Référence</th>
                  <th style={{ padding: "10px 14px" }}>Véhicule</th>
                  <th style={{ padding: "10px 14px" }}>Durée</th>
                  <th style={{ padding: "10px 14px" }}>Mensualité</th>
                  <th style={{ padding: "10px 14px" }}>Date de début</th>
                  <th style={{ padding: "10px 14px" }}>Fin prévue</th>
                  <th style={{ padding: "10px 14px" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {items.map((contrat) => (
                  <tr
                    key={contrat.id}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      opacity: contrat.is_active ? 1 : 0.7,
                    }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <Link
                        href={`/mes-dossiers/${contrat.id}`}
                        style={{
                          color: "var(--navy)",
                          fontWeight: 700,
                          textDecoration: "none",
                          fontFamily: "monospace",
                          fontSize: ".85rem",
                        }}
                      >
                        {contrat.reference}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontWeight: 600 }}>
                        {contrat.vehicle.make} {contrat.vehicle.model}
                      </span>
                      <br />
                      <span style={{ fontSize: ".82rem", color: "#6b7280" }}>
                        ({contrat.vehicle.year})
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {contrat.duree_mois != null ? (
                        <span>{contrat.duree_mois} mois</span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                      {formatMensualite(contrat.vehicle.mensualite)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {formatFrenchDate(contrat.date_debut)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {formatFrenchDate(contrat.date_fin)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <ActiveBadge isActive={contrat.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
