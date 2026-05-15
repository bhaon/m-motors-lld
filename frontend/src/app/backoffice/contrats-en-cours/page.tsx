"use client";

/**
 * US-06-11 — Tableau de bord des contrats LLD en cours (superviseur / admin).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiBase } from "@/lib/api";

type LocationPhase = "year1" | "year2" | "year3";

interface ContratEnCoursItem {
  id: number;
  reference: string;
  client: { id: number; email: string; first_name: string; last_name: string };
  vehicle: { make: string; model: string; year: number; mensualite?: number | null };
  gestionnaire_email?: string | null;
  duree_mois?: number | null;
  date_debut?: string | null;
  date_fin?: string | null;
  total_mensualite_ht?: number | null;
  location_phase: LocationPhase;
  fin_dans_3_mois: boolean;
  jours_restants?: number | null;
}

interface ContratEnCoursList {
  total: number;
  items: ContratEnCoursItem[];
}

const PHASE_STYLES: Record<
  LocationPhase,
  { label: string; color: string; bg: string; border: string }
> = {
  year1: {
    label: "1ère année",
    color: "#15803d",
    bg: "#dcfce7",
    border: "#86efac",
  },
  year2: {
    label: "2ème année",
    color: "#c2410c",
    bg: "#ffedd5",
    border: "#fdba74",
  },
  year3: {
    label: "Dernière année",
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fca5a5",
  },
};

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

function PhaseBadge({ phase }: { phase: LocationPhase }) {
  const s = PHASE_STYLES[phase];
  return (
    <span
      role="status"
      aria-label={`Phase : ${s.label}`}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: ".78rem",
        fontWeight: 700,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}

export default function BackofficeContratsEnCoursPage() {
  const [data, setData] = useState<ContratEnCoursList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase()}/api/v1/reporting/contrats-en-cours`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as ContratEnCoursList & {
        detail?: string;
      };
      if (res.status === 403) {
        setError("Accès réservé aux superviseurs et administrateurs.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(payload.detail ?? `Erreur ${res.status}`);
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const alertCount = data?.items.filter((c) => c.fin_dans_3_mois).length ?? 0;

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            color: "var(--navy)",
            marginBottom: "0.5rem",
          }}
        >
          Contrats LLD en cours
        </h1>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem", fontSize: ".95rem" }}>
          Vue superviseur — code couleur par année de location (vert / orange / rouge).
          {alertCount > 0 && (
            <strong style={{ color: "#b91c1c", marginLeft: 8 }}>
              {alertCount} contrat(s) à renouveler sous 3 mois
            </strong>
          )}
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: "1.25rem",
            flexWrap: "wrap",
            fontSize: ".85rem",
          }}
        >
          {(["year1", "year2", "year3"] as LocationPhase[]).map((p) => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PhaseBadge phase={p} />
            </span>
          ))}
        </div>

        {error && (
          <p role="alert" style={{ color: "#b91c1c", marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        {loading ? (
          <p aria-live="polite">Chargement des contrats…</p>
        ) : !data || data.items.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Aucun contrat LLD en cours pour le moment.</p>
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
                  <th style={{ padding: "10px 14px" }}>Client</th>
                  <th style={{ padding: "10px 14px" }}>Véhicule</th>
                  <th style={{ padding: "10px 14px" }}>Début</th>
                  <th style={{ padding: "10px 14px" }}>Fin</th>
                  <th style={{ padding: "10px 14px" }}>Mensualité HT</th>
                  <th style={{ padding: "10px 14px" }}>Phase</th>
                  <th style={{ padding: "10px 14px" }}>Alerte</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const rowBg = row.fin_dans_3_mois
                    ? "#fff7ed"
                    : PHASE_STYLES[row.location_phase].bg;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        background: rowBg,
                      }}
                    >
                      <td style={{ padding: "10px 14px" }}>
                        <Link
                          href={`/backoffice/dossiers/${row.id}`}
                          style={{ color: "var(--navy)", fontWeight: 600 }}
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {row.client.first_name} {row.client.last_name}
                        <br />
                        <span style={{ fontSize: ".8rem", color: "#6b7280" }}>
                          {row.client.email}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {row.vehicle.make} {row.vehicle.model} ({row.vehicle.year})
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {formatFrenchDate(row.date_debut)}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {formatFrenchDate(row.date_fin)}
                        {row.jours_restants != null && (
                          <span style={{ display: "block", fontSize: ".8rem", color: "#6b7280" }}>
                            {row.jours_restants} j restants
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {formatMensualite(row.total_mensualite_ht)}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <PhaseBadge phase={row.location_phase} />
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {row.fin_dans_3_mois ? (
                          <span style={{ color: "#b91c1c", fontWeight: 700 }}>≤ 3 mois</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
