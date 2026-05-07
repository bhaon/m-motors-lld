"use client";

import Navbar from "@/components/Navbar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type PieceType = "cni" | "permis" | "revenus" | "domicile" | "rib";

interface ChecklistItem {
  type_piece: PieceType;
  uploaded: boolean;
}

interface DossierDetail {
  id: number;
  reference: string;
  type: "achat" | "lld";
  status: string;
  created_at?: string | null;
  submitted_at?: string | null;
  checklist: ChecklistItem[];
  missing_pieces: PieceType[];
  can_submit: boolean;
}

const PIECE_LABELS: Record<PieceType, string> = {
  cni: "CNI",
  permis: "Permis de conduire",
  revenus: "Justificatif de revenus",
  domicile: "Justificatif de domicile",
  rib: "RIB",
};

/**
 * Résout l'URL backend de détail d'un dossier.
 */
function resolveDossierUrl(id: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/${id}` : `/api/v1/dossiers/${id}`;
}

/**
 * Résout l'URL backend de soumission d'un dossier.
 */
function resolveDossierSubmitUrl(id: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/${id}/submit` : `/api/v1/dossiers/${id}/submit`;
}

/**
 * Formate une date ISO au format français.
 */
function formatDate(value?: string | null): string {
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
 * Fiche dossier client avec validation de complétude et soumission finale.
 */
export default function DossierDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");

  const missingLabels = useMemo(
    () => (detail?.missing_pieces || []).map((piece) => PIECE_LABELS[piece]),
    [detail],
  );

  /**
   * Charge la fiche dossier, y compris checklist et pièces manquantes.
   */
  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(resolveDossierUrl(params.id || ""), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as DossierDetail & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Impossible de charger le dossier.");
      }
      setDetail(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  /**
   * Soumet le dossier après confirmation récapitulative.
   */
  async function submitDossier() {
    setSubmitting(true);
    setSubmitMessage("");
    setError("");
    try {
      const response = await fetch(resolveDossierSubmitUrl(params.id), {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as DossierDetail & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Soumission impossible.");
      }
      setDetail(payload);
      setSubmitMessage("Dossier soumis avec succès.");
      setShowSummary(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  return (
    <main>
      <Navbar />
      <section style={{ maxWidth: 980, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        {loading ? <p>Chargement du dossier...</p> : null}
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

        {!loading && !error && detail ? (
          <>
            <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: ".4rem" }}>Dossier {detail.reference}</h1>
            <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
              Type: <strong>{detail.type.toUpperCase()}</strong> - Statut: <strong>{detail.status}</strong> - Créé le{" "}
              <strong>{formatDate(detail.created_at)}</strong>
            </p>

            <h2 style={{ fontSize: "1rem", marginBottom: ".5rem" }}>Checklist de progression</h2>
            <div style={{ display: "grid", gap: ".55rem", marginBottom: "1rem" }}>
              {detail.checklist.map((item) => (
                <div
                  key={item.type_piece}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: ".6rem .8rem",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{PIECE_LABELS[item.type_piece]}</span>
                  <strong style={{ color: item.uploaded ? "#15803d" : "#b45309" }}>{item.uploaded ? "Uploadée" : "Manquante"}</strong>
                </div>
              ))}
            </div>

            {!detail.can_submit ? (
              <div style={{ border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 8, padding: ".85rem", marginBottom: "1rem" }}>
                <p style={{ margin: 0, color: "#991b1b", fontWeight: 700 }}>Soumission bloquée : pièces obligatoires manquantes</p>
                <p style={{ margin: ".4rem 0 0", color: "#7f1d1d" }}>{missingLabels.join(", ")}</p>
              </div>
            ) : (
              <div style={{ border: "1px solid #86efac", background: "#f0fdf4", borderRadius: 8, padding: ".85rem", marginBottom: "1rem" }}>
                <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>Dossier complet : vous pouvez le soumettre.</p>
              </div>
            )}

            {!showSummary ? (
              <button
                type="button"
                disabled={!detail.can_submit || submitting || detail.status === "depose"}
                onClick={() => setShowSummary(true)}
                style={{
                  background: !detail.can_submit || detail.status === "depose" ? "#9ca3af" : "var(--navy)",
                  color: "#fff",
                  border: 0,
                  padding: ".75rem 1rem",
                  borderRadius: 8,
                  cursor: !detail.can_submit || detail.status === "depose" ? "not-allowed" : "pointer",
                }}
              >
                Voir le récapitulatif avant soumission
              </button>
            ) : (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
                <h3 style={{ marginTop: 0 }}>Récapitulatif avant confirmation</h3>
                <p style={{ margin: ".3rem 0" }}>Référence : {detail.reference}</p>
                <p style={{ margin: ".3rem 0" }}>Type : {detail.type.toUpperCase()}</p>
                <p style={{ margin: ".3rem 0" }}>Pièces uploadées : {detail.checklist.filter((item) => item.uploaded).length}/5</p>
                <div style={{ display: "flex", gap: ".6rem", marginTop: ".9rem" }}>
                  <button
                    type="button"
                    onClick={submitDossier}
                    disabled={submitting}
                    style={{
                      background: "var(--navy)",
                      color: "#fff",
                      border: 0,
                      padding: ".7rem .95rem",
                      borderRadius: 8,
                      cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? "Soumission..." : "Confirmer la soumission"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSummary(false)}
                    style={{
                      background: "#fff",
                      color: "#0f172a",
                      border: "1px solid var(--border)",
                      padding: ".7rem .95rem",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {submitMessage ? <p style={{ color: "#166534", marginTop: ".9rem" }}>{submitMessage}</p> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
