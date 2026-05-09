"use client";

/**
 * US-06-03 — Détail complet d'un dossier pour le gestionnaire.
 * US-06-04 — Validation du dossier (bouton, statut validé, validated_at).
 * US-06-05 — Rejet avec motif obligatoire (modal, email, espace client).
 *
 * Affiche : client, véhicule, type de contrat, pièces justificatives consultables
 * dans le navigateur (visionneuse intégrée), historique des actions.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import DossierRejectModal from "@/components/DossierRejectModal";
import StatusBadge from "@/components/StatusBadge";
import { apiBase } from "@/lib/api";
import type { DossierStatus } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type PieceType = "cni" | "permis" | "revenus" | "domicile" | "rib";

interface PieceBoItem {
  type_piece: PieceType;
  uploaded: boolean;
  filename: string | null;
  uploaded_at: string | null;
}

interface HistoriqueItem {
  ancien_status: string | null;
  nouveau_status: string;
  commentaire: string | null;
  created_at: string;
}

interface DossierBoDetail {
  id: number;
  reference: string;
  type: "achat" | "lld";
  status: string;
  validated_at: string | null;
  submitted_at: string | null;
  created_at: string | null;
  rejected_at: string | null;
  motif_rejet: string | null;
  notes_internes: string | null;
  vehicle: { make: string; model: string; year: number };
  client: { id: number; email: string; first_name: string; last_name: string };
  pieces: PieceBoItem[];
  historique: HistoriqueItem[];
}

interface ViewerState {
  url: string;
  filename: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const PIECE_LABELS: Record<PieceType, string> = {
  cni: "CNI",
  permis: "Permis de conduire",
  revenus: "Justificatif de revenus",
  domicile: "Justificatif de domicile",
  rib: "RIB",
};

// ── Utilitaires ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function getFileType(filename: string): "pdf" | "image" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png"].includes(ext)) return "image";
  return "unknown";
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function BackofficeDossierDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [detail, setDetail] = useState<DossierBoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [takingCharge, setTakingCharge] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [loadingPiece, setLoadingPiece] = useState<PieceType | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase()}/api/v1/dossiers/backoffice/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as DossierBoDetail & { detail?: string };
      if (!res.ok) throw new Error(payload.detail ?? `Erreur ${res.status}`);
      setDetail(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  /**
   * Valide le dossier côté API (US-06-04) et met à jour l'état local.
   */
  async function handleValiderDossier() {
    if (!detail) return;
    setValidating(true);
    setError("");
    try {
      const res = await fetch(`${apiBase()}/api/v1/dossiers/${detail.id}/valider`, {
        method: "PATCH",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        detail?: string;
        status?: string;
        validated_at?: string | null;
      };
      if (!res.ok) throw new Error(payload.detail ?? "Erreur lors de la validation.");
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: payload.status ?? "valide",
              validated_at: payload.validated_at ?? prev.validated_at,
            }
          : prev,
      );
      setToast(`Dossier ${detail.reference} validé.`);
      setTimeout(() => setToast(""), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setValidating(false);
    }
  }

  /**
   * Envoie le rejet avec motif (US-06-05) puis met à jour l'état local.
   */
  async function handleConfirmReject(motif: string) {
    if (!detail) return;
    setRejectSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${apiBase()}/api/v1/dossiers/${detail.id}/rejeter`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        detail?: unknown;
        motif_rejet?: string;
        rejected_at?: string | null;
      };
      if (!res.ok) {
        const msg =
          typeof payload.detail === "string"
            ? payload.detail
            : "Erreur lors du rejet du dossier.";
        throw new Error(msg);
      }
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: "rejete",
              motif_rejet: payload.motif_rejet ?? motif,
              rejected_at: payload.rejected_at ?? prev.rejected_at,
            }
          : prev,
      );
      setShowRejectModal(false);
      setToast(`Dossier ${detail.reference} rejeté.`);
      setTimeout(() => setToast(""), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setRejectSubmitting(false);
    }
  }

  async function handlePrendreEnCharge() {
    if (!detail) return;
    setTakingCharge(true);
    setError("");
    try {
      const res = await fetch(
        `${apiBase()}/api/v1/dossiers/${detail.id}/prendre-en-charge`,
        { method: "PATCH", credentials: "include" },
      );
      const payload = (await res.json().catch(() => ({}))) as { detail?: string; status?: string };
      if (!res.ok) throw new Error(payload.detail ?? "Erreur lors de la prise en charge.");
      setDetail((prev) => prev ? { ...prev, status: "en_instruction" } : prev);
      setToast(`Dossier ${detail.reference} pris en charge.`);
      setTimeout(() => setToast(""), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setTakingCharge(false);
    }
  }

  async function openPieceViewer(type: PieceType) {
    setLoadingPiece(type);
    setError("");
    try {
      const res = await fetch(
        `${apiBase()}/api/v1/dossiers/backoffice/${id}/pieces/${type}/download-url`,
        { credentials: "include" },
      );
      const payload = (await res.json().catch(() => ({}))) as { download_url?: string; filename?: string; detail?: string };
      if (!res.ok || !payload.download_url) throw new Error(payload.detail ?? "Impossible d'ouvrir le document.");
      setViewer({ url: payload.download_url, filename: payload.filename ?? type });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement du document.");
    } finally {
      setLoadingPiece(null);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>

        {/* Fil d'Ariane */}
        <nav style={{ fontSize: ".85rem", marginBottom: "1.25rem", color: "var(--muted)" }}>
          <Link href="/backoffice/dossiers" style={{ color: "var(--navy)", textDecoration: "none" }}>
            ← Dossiers
          </Link>
          {detail && <span> / {detail.reference}</span>}
        </nav>

        {/* Erreur */}
        {error && (
          <p
            role="alert"
            style={{ color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, padding: ".75rem 1rem", marginBottom: "1rem" }}
          >
            {error}
          </p>
        )}

        {loading && (
          <p style={{ color: "var(--muted)", textAlign: "center", padding: "3rem" }}>Chargement du dossier…</p>
        )}

        {!loading && detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* ── En-tête ──────────────────────────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", boxShadow: "var(--shadow)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: ".75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.5rem", color: "var(--navy)", margin: 0 }}>
                    {detail.reference}
                  </h1>
                  <StatusBadge status={detail.status as DossierStatus} />
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: ".75rem", fontWeight: 700,
                    background: detail.type === "lld" ? "#dbeafe" : "#dcfce7",
                    color: detail.type === "lld" ? "#1d4ed8" : "#15803d",
                  }}>
                    {detail.type === "lld" ? "LLD" : "Achat"}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
                  {/* Bouton prise en charge */}
                  {detail.status === "depose" && (
                    <button
                      type="button"
                      aria-label={`Prendre en charge le dossier ${detail.reference}`}
                      disabled={takingCharge}
                      onClick={handlePrendreEnCharge}
                      style={{
                        padding: "8px 20px", background: takingCharge ? "#94a3b8" : "#0e7490",
                        color: "#fff", border: 0, borderRadius: 8, fontWeight: 700,
                        cursor: takingCharge ? "not-allowed" : "pointer",
                      }}
                    >
                      {takingCharge ? "…" : "Prendre en charge"}
                    </button>
                  )}
                  {/* US-06-04 — Validation */}
                  {detail.status === "en_instruction" && (
                    <button
                      type="button"
                      aria-label={`Valider le dossier ${detail.reference}`}
                      disabled={validating}
                      onClick={handleValiderDossier}
                      style={{
                        padding: "8px 20px", background: validating ? "#94a3b8" : "#15803d",
                        color: "#fff", border: 0, borderRadius: 8, fontWeight: 700,
                        cursor: validating ? "not-allowed" : "pointer",
                      }}
                    >
                      {validating ? "…" : "Valider le dossier"}
                    </button>
                  )}
                  {(detail.status === "depose" || detail.status === "en_instruction") && (
                    <button
                      type="button"
                      aria-label={`Rejeter le dossier ${detail.reference}`}
                      onClick={() => setShowRejectModal(true)}
                      style={{
                        padding: "8px 20px",
                        background: "#fff",
                        color: "#b91c1c",
                        border: "2px solid #b91c1c",
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Rejeter le dossier
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", color: "var(--muted)", fontSize: ".9rem" }}>
                <span>Créé le : <strong style={{ color: "var(--navy)" }}>{formatDate(detail.created_at)}</strong></span>
                {detail.submitted_at && (
                  <span>Déposé le : <strong style={{ color: "var(--navy)" }}>{formatDate(detail.submitted_at)}</strong></span>
                )}
                {detail.validated_at && (
                  <span>Validé le : <strong style={{ color: "var(--navy)" }}>{formatDate(detail.validated_at)}</strong></span>
                )}
                {detail.rejected_at && (
                  <span>Rejeté le : <strong style={{ color: "var(--navy)" }}>{formatDate(detail.rejected_at)}</strong></span>
                )}
              </div>

              {/* Motif de rejet */}
              {detail.status === "rejete" && detail.motif_rejet && (
                <div role="note" aria-label="Motif de rejet" style={{ marginTop: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: ".85rem 1rem" }}>
                  <p style={{ margin: "0 0 .25rem", fontWeight: 700, color: "#991b1b" }}>Motif de rejet</p>
                  <p style={{ margin: 0, color: "#7f1d1d" }}>{detail.motif_rejet}</p>
                </div>
              )}
            </div>

            {/* ── Client + Véhicule (2 colonnes) ───────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

              {/* Client */}
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", boxShadow: "var(--shadow)" }}>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", color: "var(--navy)", marginTop: 0, marginBottom: "1rem" }}>
                  Client
                </h2>
                <dl style={{ margin: 0, display: "grid", rowGap: ".5rem" }}>
                  <div>
                    <dt style={{ fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Nom</dt>
                    <dd style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>
                      {detail.client.first_name} {detail.client.last_name}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Email</dt>
                    <dd style={{ margin: 0, color: "#374151" }}>{detail.client.email}</dd>
                  </div>
                </dl>
              </div>

              {/* Véhicule */}
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", boxShadow: "var(--shadow)" }}>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", color: "var(--navy)", marginTop: 0, marginBottom: "1rem" }}>
                  Véhicule
                </h2>
                <dl style={{ margin: 0, display: "grid", rowGap: ".5rem" }}>
                  <div>
                    <dt style={{ fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Modèle</dt>
                    <dd style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>
                      {detail.vehicle.make} {detail.vehicle.model}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Année</dt>
                    <dd style={{ margin: 0, color: "#374151" }}>{detail.vehicle.year}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: ".78rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Contrat</dt>
                    <dd style={{ margin: 0, color: "#374151" }}>{detail.type === "lld" ? "LLD" : "Achat"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* ── Pièces justificatives ─────────────────────────────── */}
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", boxShadow: "var(--shadow)" }}>
              <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", color: "var(--navy)", marginTop: 0, marginBottom: "1rem" }}>
                Pièces justificatives ({detail.pieces.filter((p) => p.uploaded).length}/5)
              </h2>

              <div style={{ display: "grid", gap: ".5rem" }}>
                {detail.pieces.map((piece) => (
                  <div
                    key={piece.type_piece}
                    style={{
                      border: "1px solid var(--border)", borderRadius: 8, padding: ".75rem 1rem",
                      display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: ".75rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "#1f2937" }}>{PIECE_LABELS[piece.type_piece]}</span>
                      {piece.uploaded && piece.filename && (
                        <span style={{ display: "block", fontSize: ".78rem", color: "var(--muted)" }}>
                          {piece.filename}
                          {piece.uploaded_at && ` — déposé le ${formatDate(piece.uploaded_at)}`}
                        </span>
                      )}
                      <strong style={{ display: "block", fontSize: ".82rem", color: piece.uploaded ? "#15803d" : "#b45309" }}>
                        {piece.uploaded ? "✓ Déposée" : "Manquante"}
                      </strong>
                    </div>

                    {piece.uploaded && (
                      <button
                        type="button"
                        aria-label={`Consulter ${PIECE_LABELS[piece.type_piece]}`}
                        onClick={() => openPieceViewer(piece.type_piece)}
                        disabled={loadingPiece === piece.type_piece}
                        style={{
                          padding: "6px 14px",
                          background: loadingPiece === piece.type_piece ? "#e5e7eb" : "#f0fdf4",
                          color: "#15803d", border: "1px solid #86efac", borderRadius: 6,
                          fontSize: ".78rem", fontWeight: 700,
                          cursor: loadingPiece === piece.type_piece ? "wait" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {loadingPiece === piece.type_piece ? "…" : "Consulter"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Historique ────────────────────────────────────────── */}
            {detail.historique.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", boxShadow: "var(--shadow)" }}>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", color: "var(--navy)", marginTop: 0, marginBottom: "1rem" }}>
                  Historique du dossier
                </h2>
                <ol
                  aria-label="Historique des changements de statut"
                  style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: ".75rem" }}
                >
                  {detail.historique.map((entry, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex", gap: "1rem", alignItems: "flex-start",
                        paddingBottom: ".75rem",
                        borderBottom: i < detail.historique.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <span style={{ flex: "0 0 auto", color: "var(--muted)", fontSize: ".8rem", paddingTop: ".15rem", whiteSpace: "nowrap" }}>
                        {formatDate(entry.created_at)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                          {entry.ancien_status && (
                            <>
                              <StatusBadge status={entry.ancien_status as DossierStatus} />
                              <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>→</span>
                            </>
                          )}
                          <StatusBadge status={entry.nouveau_status as DossierStatus} />
                        </div>
                        {entry.commentaire && (
                          <p style={{ margin: ".35rem 0 0", fontSize: ".85rem", color: "var(--muted)" }}>
                            {entry.commentaire}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Toast prise en charge */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 9999,
            background: "#0e7490", color: "#fff",
            padding: ".75rem 1.25rem", borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,.18)",
            fontWeight: 600, fontSize: ".9rem",
          }}
        >
          {toast}
        </div>
      )}

      {/* Visionneuse de pièce */}
      {viewer && (
        <div
          role="dialog"
          aria-label={`Visionneuse : ${viewer.filename}`}
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setViewer(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,.65)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 900,
              maxHeight: "90vh", display: "flex", flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,.35)",
            }}
          >
            {/* Barre de titre */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: ".9rem" }}>{viewer.filename}</span>
              <button
                type="button"
                aria-label="Fermer la visionneuse"
                onClick={() => setViewer(null)}
                style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Contenu */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
              {getFileType(viewer.filename) === "pdf" ? (
                <iframe
                  title={viewer.filename}
                  src={viewer.url}
                  style={{ width: "100%", height: "70vh", border: "none" }}
                />
              ) : getFileType(viewer.filename) === "image" ? (
                <img
                  src={viewer.url}
                  alt={viewer.filename}
                  style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
                />
              ) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                  <p>Aperçu non disponible pour ce format.</p>
                  <a href={viewer.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "var(--navy)", fontWeight: 700 }}>
                    Télécharger le fichier
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRejectModal && detail && (
        <DossierRejectModal
          dossierReference={detail.reference}
          submitting={rejectSubmitting}
          onCancel={() => {
            if (!rejectSubmitting) setShowRejectModal(false);
          }}
          onConfirm={handleConfirmReject}
        />
      )}
    </>
  );
}
