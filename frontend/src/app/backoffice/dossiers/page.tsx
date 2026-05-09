"use client";

/**
 * US-06-01 — Tableau de bord gestionnaire : liste des dossiers en attente.
 *
 * Filtres : statut (multiselect), type de contrat, plage de dates.
 * Tri par date de dépôt (plus anciens en premier par défaut).
 * Pagination côté serveur.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiBase } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type DossierStatus = "brouillon" | "depose" | "en_instruction" | "valide" | "rejete" | "annule";
type DossierType = "achat" | "lld";
type SortOption = "submitted_asc" | "submitted_desc" | "created_desc";

interface DossierBoItem {
  id: number;
  reference: string;
  type: DossierType;
  status: DossierStatus;
  submitted_at: string | null;
  created_at: string | null;
  pieces_count: number;
  vehicle: { make: string; model: string; year: number };
  client: { id: number; email: string; first_name: string; last_name: string };
}

interface DossierBoList {
  total: number;
  page: number;
  page_size: number;
  items: DossierBoItem[];
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ALL_STATUTS: { value: DossierStatus; label: string; color: string; bg: string }[] = [
  { value: "brouillon",      label: "Brouillon",      color: "#6b7280", bg: "#f3f4f6" },
  { value: "depose",         label: "Déposé",         color: "#1d4ed8", bg: "#dbeafe" },
  { value: "en_instruction", label: "En instruction", color: "#b45309", bg: "#fef3c7" },
  { value: "valide",         label: "Validé",         color: "#15803d", bg: "#dcfce7" },
  { value: "rejete",         label: "Rejeté",         color: "#b91c1c", bg: "#fee2e2" },
  { value: "annule",         label: "Annulé",         color: "#6b7280", bg: "#f3f4f6" },
];

const DEFAULT_STATUTS: DossierStatus[] = ["depose", "en_instruction"];
const PAGE_SIZE = 20;

// ── Utilitaires ───────────────────────────────────────────────────────────────

function statusConfig(status: DossierStatus) {
  return ALL_STATUTS.find((s) => s.value === status) ?? ALL_STATUTS[0];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

/** Nombre de jours écoulés depuis la date ISO. */
function ageDays(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86_400_000);
}

function buildUrl(filters: FilterState, page: number): string {
  const base = `${apiBase()}/api/v1/dossiers/backoffice`;
  const params = new URLSearchParams();
  filters.statuts.forEach((s) => params.append("statuts", s));
  if (filters.type_contrat) params.set("type_contrat", filters.type_contrat);
  if (filters.date_from) params.set("date_from", `${filters.date_from}T00:00:00`);
  if (filters.date_to) params.set("date_to", `${filters.date_to}T23:59:59`);
  params.set("sort", filters.sort);
  params.set("page", String(page));
  params.set("page_size", String(PAGE_SIZE));
  return `${base}?${params.toString()}`;
}

// ── État des filtres ──────────────────────────────────────────────────────────

interface FilterState {
  statuts: DossierStatus[];
  type_contrat: DossierType | "";
  date_from: string;
  date_to: string;
  sort: SortOption;
}

const INITIAL_FILTERS: FilterState = {
  statuts: DEFAULT_STATUTS,
  type_contrat: "",
  date_from: "",
  date_to: "",
  sort: "submitted_asc",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BackofficeDossiersPage() {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [data, setData] = useState<DossierBoList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const fetchDossiers = useCallback(async (f: FilterState, p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(buildUrl(f, p), { credentials: "include" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? `Erreur ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDossiers(filters, page);
  }, [fetchDossiers, filters, page]);

  function applyFilters() {
    setFilters(pendingFilters);
    setPage(1);
  }

  function resetFilters() {
    setPendingFilters(INITIAL_FILTERS);
    setFilters(INITIAL_FILTERS);
    setPage(1);
  }

  function toggleStatut(s: DossierStatus) {
    setPendingFilters((prev) => ({
      ...prev,
      statuts: prev.statuts.includes(s)
        ? prev.statuts.filter((x) => x !== s)
        : [...prev.statuts, s],
    }));
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--navy)", margin: 0 }}>
              Dossiers en attente
            </h1>
            {data && !loading && (
              <p style={{ color: "var(--muted)", fontSize: ".85rem", marginTop: 4 }}>
                {data.total} dossier{data.total !== 1 ? "s" : ""} trouvé{data.total !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <nav style={{ fontSize: ".82rem", color: "var(--muted)" }}>
            <Link href="/backoffice/vehicules" style={{ color: "var(--navy)", textDecoration: "none" }}>
              Véhicules
            </Link>
            {" / "}
            <span>Dossiers</span>
          </nav>
        </div>

        {/* Panneau de filtres */}
        <div
          aria-label="Filtres"
          style={{ background: "var(--off)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.2rem 1.4rem", marginBottom: "1.5rem" }}
        >
          {/* Statuts */}
          <div style={{ marginBottom: "1rem" }}>
            <p style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--navy)", marginBottom: ".5rem", textTransform: "uppercase", letterSpacing: ".06em" }}>
              Statut
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
              {ALL_STATUTS.map((s) => {
                const active = pendingFilters.statuts.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleStatut(s.value)}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 999,
                      border: active ? `2px solid ${s.color}` : "1.5px solid #d1d5db",
                      background: active ? s.bg : "#fff",
                      color: active ? s.color : "#6b7280",
                      fontWeight: active ? 700 : 500,
                      fontSize: ".8rem",
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            {/* Type de contrat */}
            <div>
              <label htmlFor="bo-type" style={{ display: "block", fontWeight: 700, fontSize: ".82rem", color: "var(--navy)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Type
              </label>
              <select
                id="bo-type"
                value={pendingFilters.type_contrat}
                onChange={(e) => setPendingFilters((p) => ({ ...p, type_contrat: e.target.value as DossierType | "" }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: ".88rem" }}
              >
                <option value="">Tous</option>
                <option value="achat">Achat</option>
                <option value="lld">LLD</option>
              </select>
            </div>

            {/* Date from */}
            <div>
              <label htmlFor="bo-date-from" style={{ display: "block", fontWeight: 700, fontSize: ".82rem", color: "var(--navy)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Déposé depuis
              </label>
              <input
                id="bo-date-from"
                type="date"
                value={pendingFilters.date_from}
                onChange={(e) => setPendingFilters((p) => ({ ...p, date_from: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: ".88rem", boxSizing: "border-box" }}
              />
            </div>

            {/* Date to */}
            <div>
              <label htmlFor="bo-date-to" style={{ display: "block", fontWeight: 700, fontSize: ".82rem", color: "var(--navy)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Déposé jusqu&apos;au
              </label>
              <input
                id="bo-date-to"
                type="date"
                value={pendingFilters.date_to}
                onChange={(e) => setPendingFilters((p) => ({ ...p, date_to: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: ".88rem", boxSizing: "border-box" }}
              />
            </div>

            {/* Tri */}
            <div>
              <label htmlFor="bo-sort" style={{ display: "block", fontWeight: 700, fontSize: ".82rem", color: "var(--navy)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Tri
              </label>
              <select
                id="bo-sort"
                value={pendingFilters.sort}
                onChange={(e) => setPendingFilters((p) => ({ ...p, sort: e.target.value as SortOption }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: ".88rem" }}
              >
                <option value="submitted_asc">Dépôt — plus anciens en premier</option>
                <option value="submitted_desc">Dépôt — plus récents en premier</option>
                <option value="created_desc">Création — plus récents en premier</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: ".75rem" }}>
            <button
              type="button"
              onClick={applyFilters}
              style={{ padding: "8px 22px", background: "var(--navy)", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, fontSize: ".88rem", cursor: "pointer" }}
            >
              Appliquer
            </button>
            <button
              type="button"
              onClick={resetFilters}
              style={{ padding: "8px 18px", background: "#fff", color: "var(--navy)", border: "1px solid var(--navy)", borderRadius: 7, fontWeight: 600, fontSize: ".88rem", cursor: "pointer" }}
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <p role="alert" style={{ color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: ".75rem 1rem", marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        {/* Chargement */}
        {loading && (
          <p style={{ color: "var(--muted)", textAlign: "center", padding: "3rem" }}>
            Chargement des dossiers…
          </p>
        )}

        {/* Tableau */}
        {!loading && data && data.items.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--muted)" }}>
            <div style={{ fontSize: "2.5rem", opacity: 0.4, marginBottom: ".75rem" }}>📂</div>
            <p style={{ fontWeight: 600, color: "var(--navy)" }}>Aucun dossier trouvé</p>
            <p style={{ fontSize: ".88rem" }}>Modifiez les filtres ou vérifiez plus tard.</p>
          </div>
        )}

        {!loading && data && data.items.length > 0 && (
          <>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
                <thead>
                  <tr style={{ background: "var(--off)", borderBottom: "2px solid var(--border)" }}>
                    {["Référence", "Client", "Véhicule", "Type", "Statut", "Pièces", "Déposé le", "Ancienneté"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d, i) => {
                    const cfg = statusConfig(d.status);
                    const age = ageDays(d.submitted_at);
                    return (
                      <tr
                        key={d.id}
                        style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "#fff" : "var(--off)" }}
                      >
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "var(--navy)", whiteSpace: "nowrap" }}>
                          {d.reference}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#1f2937" }}>
                            {d.client.first_name} {d.client.last_name}
                          </div>
                          <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>{d.client.email}</div>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {d.vehicle.make} {d.vehicle.model} <span style={{ color: "var(--muted)" }}>({d.vehicle.year})</span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: ".75rem",
                            fontWeight: 700,
                            background: d.type === "lld" ? "#dbeafe" : "#dcfce7",
                            color: d.type === "lld" ? "#1d4ed8" : "#15803d",
                          }}>
                            {d.type.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: ".75rem", fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: d.pieces_count === 5 ? "#15803d" : "#b45309", fontWeight: 700 }}>
                          {d.pieces_count}/5
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#374151" }}>
                          {formatDate(d.submitted_at)}
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {age !== null ? (
                            <span style={{ fontWeight: 600, color: age > 7 ? "#b91c1c" : age > 3 ? "#b45309" : "#15803d" }}>
                              {age}j
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.2rem", flexWrap: "wrap", gap: ".5rem" }}>
                <p style={{ fontSize: ".85rem", color: "var(--muted)" }}>
                  Page {data.page} sur {totalPages} — {data.total} dossier{data.total !== 1 ? "s" : ""}
                </p>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    aria-label="Page précédente"
                    style={{ padding: "7px 16px", border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontWeight: 600, fontSize: ".85rem" }}
                  >
                    ← Précédent
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Page suivante"
                    style={{ padding: "7px 16px", border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.4 : 1, fontWeight: 600, fontSize: ".85rem" }}
                  >
                    Suivant →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
