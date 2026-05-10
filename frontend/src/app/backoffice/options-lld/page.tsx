"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiBase } from "@/lib/api";

/** Ligne renvoyée par GET /api/v1/backoffice/lld-catalog (US-07-03). */
interface LldCatalogBoItem {
  code: string;
  label: string;
  description: string;
  enabled: boolean;
  surcout_mensuel_ht: number;
  flag_updated_at: string | null;
}

interface PriceHistoryRow {
  id: number;
  price_ht: number;
  valid_from: string;
  created_by_user_id: number | null;
}

function catalogUrl() {
  return `${apiBase()}/api/v1/backoffice/lld-catalog`;
}

/**
 * Page back-office : gestion du catalogue options LLD (textes, activation, tarifs, historique).
 */
export default function BackofficeLldOptionsPage() {
  const [items, setItems] = useState<LldCatalogBoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editRow, setEditRow] = useState<LldCatalogBoItem | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [priceRow, setPriceRow] = useState<LldCatalogBoItem | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const [histCode, setHistCode] = useState<string | null>(null);
  const [histRows, setHistRows] = useState<PriceHistoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(catalogUrl(), { credentials: "include", cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { detail?: string; items?: LldCatalogBoItem[] };
      if (!res.ok) {
        throw new Error(data.detail || "Chargement impossible.");
      }
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveText(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    const res = await fetch(`${catalogUrl()}/${editRow.code}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim(), description: editDesc.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { detail?: string }).detail || "Enregistrement refusé.");
      return;
    }
    setEditRow(null);
    await load();
  }

  async function savePrice(e: React.FormEvent) {
    e.preventDefault();
    if (!priceRow) return;
    const v = Number(priceInput.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      setError("Montant HT invalide.");
      return;
    }
    const res = await fetch(`${catalogUrl()}/${priceRow.code}/price`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surcout_mensuel_ht: v }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { detail?: string }).detail || "Tarif refusé.");
      return;
    }
    setPriceRow(null);
    setPriceInput("");
    await load();
  }

  async function toggleEnabled(row: LldCatalogBoItem, enabled: boolean) {
    const res = await fetch(`${catalogUrl()}/${row.code}/activation`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { detail?: string }).detail || "Mise à jour impossible.");
      return;
    }
    await load();
  }

  async function openHistory(code: string) {
    setHistCode(code);
    const res = await fetch(`${catalogUrl()}/${code}/price-history`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { detail?: string }).detail || "Historique indisponible.");
      setHistRows([]);
      return;
    }
    setHistRows((data as { history?: PriceHistoryRow[] }).history ?? []);
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <Link href="/backoffice/dossiers" style={{ color: "var(--navy)", fontWeight: 600, textDecoration: "none" }}>
            ← Dossiers
          </Link>
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--navy)", margin: "0 0 .5rem" }}>
          Options LLD — catalogue
        </h1>
        <p style={{ color: "#475569", marginBottom: "1.25rem", maxWidth: 640 }}>
          US-07-03 : libellés, descriptions, activation (feature flags) et tarifs avec historique.
        </p>

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 600, marginBottom: "1rem" }}>
            {error}
          </p>
        ) : null}

        {loading ? (
          <p>Chargement…</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Code</th>
                  <th style={{ padding: "10px 12px" }}>Libellé</th>
                  <th style={{ padding: "10px 12px" }}>Tarif HT / mois</th>
                  <th style={{ padding: "10px 12px" }}>Active</th>
                  <th style={{ padding: "10px 12px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.code} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{row.code}</td>
                    <td style={{ padding: "10px 12px" }}>{row.label}</td>
                    <td style={{ padding: "10px 12px" }}>{row.surcout_mensuel_ht.toFixed(2)} €</td>
                    <td style={{ padding: "10px 12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => void toggleEnabled(row, e.target.checked)}
                          aria-label={`Activer ${row.code}`}
                        />
                        <span>{row.enabled ? "Oui" : "Non"}</span>
                      </label>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditRow(row);
                          setEditLabel(row.label);
                          setEditDesc(row.description);
                        }}
                        style={{ marginRight: 8, color: "#0e7490", fontWeight: 600, background: "none", border: 0, cursor: "pointer" }}
                      >
                        Texte
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceRow(row);
                          setPriceInput(String(row.surcout_mensuel_ht));
                        }}
                        style={{ marginRight: 8, color: "#6d28d9", fontWeight: 600, background: "none", border: 0, cursor: "pointer" }}
                      >
                        Tarif
                      </button>
                      <button
                        type="button"
                        onClick={() => void openHistory(row.code)}
                        style={{ color: "#0f172a", fontWeight: 600, background: "none", border: 0, cursor: "pointer" }}
                      >
                        Historique
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editRow ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 200,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "3rem 1rem",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditRow(null);
            }}
          >
            <form
              onSubmit={(e) => void saveText(e)}
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: "1.5rem 2rem",
                maxWidth: 520,
                width: "100%",
                boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ marginTop: 0 }}>Modifier {editRow.code}</h2>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Libellé</label>
              <input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                style={{ width: "100%", padding: 8, marginBottom: 12, borderRadius: 8, border: "1px solid #cbd5e1" }}
              />
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
                style={{ width: "100%", padding: 8, marginBottom: 16, borderRadius: 8, border: "1px solid #cbd5e1" }}
              />
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setEditRow(null)} style={{ padding: "8px 16px" }}>
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    background: "var(--navy)",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {priceRow ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 200,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "3rem 1rem",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setPriceRow(null);
            }}
          >
            <form
              onSubmit={(e) => void savePrice(e)}
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: "1.5rem 2rem",
                maxWidth: 400,
                width: "100%",
                boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Nouveau tarif — {priceRow.code}</h2>
              <p style={{ color: "#64748b", fontSize: ".9rem" }}>
                Le montant s’applique aux nouvelles lignes dossier ; l’historique conserve les tarifs passés.
              </p>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Surcoût mensuel HT (€)</label>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                inputMode="decimal"
                style={{ width: "100%", padding: 8, marginBottom: 16, borderRadius: 8, border: "1px solid #cbd5e1" }}
              />
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setPriceRow(null)} style={{ padding: "8px 16px" }}>
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    background: "#6d28d9",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Enregistrer le tarif
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {histCode ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 200,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "3rem 1rem",
              overflowY: "auto",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setHistCode(null);
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: "1.5rem 2rem",
                maxWidth: 560,
                width: "100%",
                boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Historique — {histCode}</h2>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {histRows.map((h) => (
                  <li key={h.id} style={{ marginBottom: 8 }}>
                    <strong>{h.price_ht.toFixed(2)} €</strong> — {new Date(h.valid_from).toLocaleString("fr-FR")}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setHistCode(null)}
                style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
              >
                Fermer
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
