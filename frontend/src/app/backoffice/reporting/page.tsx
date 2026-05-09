"use client";

/**
 * US-06-06 — Reporting synthétique des dossiers (superviseur / admin).
 *
 * Affiche les volumes par statut, le taux de validation et le délai moyen de traitement,
 * filtrables par période calendaire (semaine ISO, mois, trimestre).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiBase } from "@/lib/api";

type Period = "week" | "month" | "quarter";

interface ReportingPayload {
  period: Period;
  period_start: string;
  period_end_exclusive: string;
  cohort_count: number;
  by_status: Record<string, number>;
  validation_rate: number | null;
  avg_processing_days: number | null;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: "Semaine",
  month: "Mois",
  quarter: "Trimestre",
};

const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  depose: "Déposé",
  en_instruction: "En instruction",
  valide: "Validé",
  rejete: "Rejeté",
  annule: "Annulé",
};

function formatPct(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function formatDays(days: number | null): string {
  if (days === null || Number.isNaN(days)) return "—";
  return `${days.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`;
}

export default function BackofficeReportingPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<ReportingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${apiBase()}/api/v1/reporting/dossiers?period=${period}`,
        { credentials: "include", cache: "no-store" },
      );
      const payload = (await res.json().catch(() => ({}))) as ReportingPayload & { detail?: string };
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
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Télécharge l’export CSV pour la période sélectionnée (mêmes filtres que le tableau).
   */
  async function handleExportCsv() {
    setError("");
    try {
      const res = await fetch(
        `${apiBase()}/api/v1/reporting/dossiers/export.csv?period=${period}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) {
        const raw = await res.text();
        try {
          const errBody = JSON.parse(raw) as { detail?: string };
          throw new Error(errBody.detail ?? `Erreur ${res.status}`);
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Erreur")) throw e;
          throw new Error(raw.slice(0, 200) || `Erreur ${res.status}`);
        }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporting-dossiers-${period}.csv`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du téléchargement.");
    }
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <nav style={{ fontSize: ".85rem", marginBottom: "1.25rem", color: "var(--muted)" }}>
          <Link href="/backoffice/dossiers" style={{ color: "var(--navy)", textDecoration: "none" }}>
            ← Dossiers
          </Link>
          <span> / Reporting</span>
        </nav>

        <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.5rem", color: "var(--navy)", marginBottom: ".5rem" }}>
          Reporting dossiers
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: ".95rem", lineHeight: 1.5 }}>
          Synthèse basée sur les dossiers <strong>déposés</strong> dans la période calendaire sélectionnée (date de dépôt).
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", alignItems: "center", marginBottom: "1.25rem" }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: period === p ? "2px solid var(--navy)" : "1px solid var(--border)",
                background: period === p ? "#e0f2fe" : "#fff",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: ".85rem",
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || !!error}
            style={{
              marginLeft: "auto",
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #15803d",
              background: loading ? "#e5e7eb" : "#dcfce7",
              color: "#15803d",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: ".85rem",
            }}
          >
            Exporter CSV
          </button>
        </div>

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

        {loading && <p style={{ color: "var(--muted)" }}>Chargement…</p>}

        {!loading && data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
              }}
            >
              <MetricCard title="Dossiers (cohorte)" value={String(data.cohort_count)} />
              <MetricCard title="Taux de validation" value={formatPct(data.validation_rate)} hint="parmi validés + rejetés" />
              <MetricCard title="Délai moyen de traitement" value={formatDays(data.avg_processing_days)} hint="dépôt → décision" />
            </div>

            <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>
              Période UTC : {new Date(data.period_start).toLocaleString("fr-FR")} →{" "}
              {new Date(data.period_end_exclusive).toLocaleString("fr-FR")} (fin exclusive)
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "1.25rem 1.5rem",
                boxShadow: "var(--shadow)",
              }}
            >
              <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", marginTop: 0, color: "var(--navy)" }}>
                Volume par statut
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: ".5rem 0" }}>Statut</th>
                    <th style={{ padding: ".5rem 0" }}>Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.by_status).map(([key, n]) => (
                    <tr key={key} style={{ borderBottom: "1px solid rgba(15,23,42,.06)" }}>
                      <td style={{ padding: ".45rem 0" }}>{STATUS_LABELS[key] ?? key}</td>
                      <td style={{ padding: ".45rem 0", fontWeight: 600 }}>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function MetricCard({
  title,
  value,
  hint,
}: Readonly<{ title: string; value: string; hint?: string }>) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "1rem 1.25rem",
        boxShadow: "var(--shadow)",
      }}
    >
      <p style={{ margin: 0, fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {title}
      </p>
      <p style={{ margin: ".35rem 0 0", fontSize: "1.35rem", fontWeight: 800, color: "var(--navy)" }}>{value}</p>
      {hint ? (
        <p style={{ margin: ".35rem 0 0", fontSize: ".75rem", color: "var(--muted)" }}>{hint}</p>
      ) : null}
    </div>
  );
}
