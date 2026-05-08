"use client";

import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusBadge";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { DossierStatus } from "@/types";

type PieceType = "cni" | "permis" | "revenus" | "domicile" | "rib";

interface ChecklistItem {
  type_piece: PieceType;
  uploaded: boolean;
  filename?: string | null;
}

interface HistoriqueItem {
  ancien_status: string | null;
  nouveau_status: string;
  commentaire: string | null;
  created_at: string;
}

interface DossierVehicle {
  make: string;
  model: string;
  year: number;
}

interface DossierDetail {
  id: number;
  reference: string;
  type: "achat" | "lld";
  status: string;
  created_at?: string | null;
  submitted_at?: string | null;
  motif_rejet?: string | null;
  vehicle?: DossierVehicle | null;
  checklist: ChecklistItem[];
  missing_pieces: PieceType[];
  can_submit: boolean;
  historique?: HistoriqueItem[];
}

const PIECE_LABELS: Record<PieceType, string> = {
  cni: "CNI",
  permis: "Permis de conduire",
  revenus: "Justificatif de revenus",
  domicile: "Justificatif de domicile",
  rib: "RIB",
};
const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function resolveDossierUrl(id: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/${id}` : `/api/v1/dossiers/${id}`;
}

function resolveDossierSubmitUrl(id: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/dossiers/${id}/submit` : `/api/v1/dossiers/${id}/submit`;
}

function resolveDownloadUrl(dossierId: string, typePiece: PieceType): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  const path = `/api/v1/dossiers/${dossierId}/pieces/${typePiece}/download-url`;
  return base ? `${base}${path}` : path;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function computeFileSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sha256HexToBase64(hex: string): string {
  const pairs = hex.match(/.{1,2}/g) || [];
  const bytes = new Uint8Array(pairs.map((pair) => parseInt(pair, 16)));
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

export default function DossierDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadingType, setUploadingType] = useState<PieceType | null>(null);
  const [downloadingType, setDownloadingType] = useState<PieceType | null>(null);

  const missingLabels = useMemo(
    () => (detail?.missing_pieces || []).map((piece) => PIECE_LABELS[piece]),
    [detail],
  );

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

  async function downloadPiece(type: PieceType) {
    setError("");
    setDownloadingType(type);
    try {
      const response = await fetch(resolveDownloadUrl(params.id, type), {
        method: "GET",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as { download_url?: string; detail?: string };
      if (!response.ok || !payload.download_url) {
        throw new Error(payload.detail || "Impossible de générer le lien de téléchargement.");
      }
      window.open(payload.download_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de téléchargement.");
    } finally {
      setDownloadingType(null);
    }
  }

  async function uploadPiece(type: PieceType, file: File) {
    setError("");
    setUploadMessage("");
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Format invalide: utilisez PDF, JPG ou PNG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Fichier trop volumineux: 10 Mo maximum.");
      return;
    }
    setUploadingType(type);
    try {
      const checksumHex = await computeFileSha256Hex(file);
      const checksumBase64 = sha256HexToBase64(checksumHex);
      const initResponse = await fetch(`${resolveDossierUrl(params.id || "")}/pieces/upload-init`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_piece: type,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
          checksum_sha256: checksumBase64,
        }),
      });
      const initPayload = (await initResponse.json().catch(() => ({}))) as {
        upload_url?: string;
        s3_key?: string;
        headers?: Record<string, string>;
        detail?: string;
      };
      if (!initResponse.ok || !initPayload.upload_url || !initPayload.s3_key || !initPayload.headers) {
        throw new Error(initPayload.detail || "Pré-signature impossible.");
      }
      const uploadResponse = await fetch(initPayload.upload_url, {
        method: "PUT",
        headers: initPayload.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Upload du document échoué.");
      }
      const completeResponse = await fetch(`${resolveDossierUrl(params.id || "")}/pieces/upload-complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_piece: type,
          filename: file.name,
          s3_key: initPayload.s3_key,
          checksum_sha256: checksumHex,
        }),
      });
      const completePayload = (await completeResponse.json().catch(() => ({}))) as { detail?: string };
      if (!completeResponse.ok) {
        throw new Error(completePayload.detail || "Validation du document impossible.");
      }
      setUploadMessage(`${PIECE_LABELS[type]} uploadée avec succès.`);
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'upload.");
    } finally {
      setUploadingType(null);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  return (
    <main>
      <Navbar />
      <section
        style={{
          maxWidth: 980,
          margin: "2rem auto",
          padding: "0 1rem 3rem",
        }}
      >
        <Link
          href="/mes-dossiers"
          style={{
            display: "inline-block",
            marginBottom: "1.25rem",
            color: "var(--navy)",
            textDecoration: "none",
            fontSize: ".9rem",
          }}
        >
          ← Retour à mes dossiers
        </Link>

        {loading && <p style={{ color: "var(--muted)" }}>Chargement du dossier…</p>}

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

        {uploadMessage && (
          <p style={{ color: "#166534", marginBottom: "1rem" }}>{uploadMessage}</p>
        )}

        {!loading && !error && detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* ── En-tête dossier ─────────────────────────────── */}
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "1.25rem 1.5rem",
                boxShadow: "var(--shadow)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: ".75rem" }}>
                <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.5rem", color: "var(--navy)", margin: 0 }}>
                  {detail.reference}
                </h1>
                <StatusBadge status={detail.status as DossierStatus} />
              </div>

              {/* Infos véhicule */}
              {detail.vehicle && (
                <p style={{ margin: "0 0 .4rem", color: "var(--navy)", fontWeight: 600 }}>
                  {detail.vehicle.make} {detail.vehicle.model}{" "}
                  <span style={{ fontWeight: 400, color: "var(--muted)" }}>({detail.vehicle.year})</span>
                </p>
              )}

              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", color: "var(--muted)", fontSize: ".9rem" }}>
                <span>
                  Type :{" "}
                  <strong style={{ color: "var(--navy)" }}>
                    {detail.type === "lld" ? "LLD" : "Achat"}
                  </strong>
                </span>
                <span>
                  Créé le : <strong style={{ color: "var(--navy)" }}>{formatDate(detail.created_at)}</strong>
                </span>
                {detail.submitted_at && (
                  <span>
                    Déposé le : <strong style={{ color: "var(--navy)" }}>{formatDate(detail.submitted_at)}</strong>
                  </span>
                )}
              </div>

              {/* Motif de rejet */}
              {detail.status === "rejete" && detail.motif_rejet && (
                <div
                  role="note"
                  aria-label="Motif de rejet"
                  style={{
                    marginTop: "1rem",
                    background: "#fef2f2",
                    border: "1px solid #fca5a5",
                    borderRadius: 8,
                    padding: ".85rem 1rem",
                  }}
                >
                  <p style={{ margin: "0 0 .25rem", fontWeight: 700, color: "#991b1b" }}>
                    Motif de rejet
                  </p>
                  <p style={{ margin: 0, color: "#7f1d1d" }}>{detail.motif_rejet}</p>
                </div>
              )}
            </div>

            {/* ── Checklist pièces ────────────────────────────── */}
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "1.25rem 1.5rem",
                boxShadow: "var(--shadow)",
              }}
            >
              <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", marginBottom: ".75rem", color: "var(--navy)" }}>
                Pièces justificatives
              </h2>

              {!detail.can_submit && (
                <div
                  style={{
                    border: "1px solid #fca5a5",
                    background: "#fef2f2",
                    borderRadius: 8,
                    padding: ".75rem 1rem",
                    marginBottom: ".75rem",
                  }}
                >
                  <p style={{ margin: 0, color: "#991b1b", fontWeight: 700 }}>
                    Soumission bloquée : pièces obligatoires manquantes
                  </p>
                  <p style={{ margin: ".25rem 0 0", color: "#7f1d1d", fontSize: ".9rem" }}>
                    {missingLabels.join(", ")}
                  </p>
                </div>
              )}

              {detail.can_submit && (
                <div
                  style={{
                    border: "1px solid #86efac",
                    background: "#f0fdf4",
                    borderRadius: 8,
                    padding: ".75rem 1rem",
                    marginBottom: ".75rem",
                  }}
                >
                  <p style={{ margin: 0, color: "#166534", fontWeight: 700 }}>
                    Dossier complet : vous pouvez le soumettre.
                  </p>
                </div>
              )}

              <div style={{ display: "grid", gap: ".5rem" }}>
                {detail.checklist.map((item) => (
                  <div
                    key={item.type_piece}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: ".6rem .9rem",
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      alignItems: "center",
                      gap: ".75rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>{PIECE_LABELS[item.type_piece]}</span>
                      {item.uploaded && item.filename && (
                        <span style={{ display: "block", fontSize: ".78rem", color: "var(--muted)" }}>
                          {item.filename}
                        </span>
                      )}
                      <strong
                        style={{
                          display: "block",
                          fontSize: ".82rem",
                          color: item.uploaded ? "#15803d" : "#b45309",
                        }}
                      >
                        {item.uploaded ? "✓ Déposée" : "Manquante"}
                      </strong>
                    </div>

                    {/* Bouton télécharger */}
                    {item.uploaded && (
                      <button
                        type="button"
                        aria-label={`Télécharger ${PIECE_LABELS[item.type_piece]}`}
                        onClick={() => downloadPiece(item.type_piece)}
                        disabled={downloadingType === item.type_piece}
                        style={{
                          background: downloadingType === item.type_piece ? "#e5e7eb" : "#f0fdf4",
                          color: "#15803d",
                          border: "1px solid #86efac",
                          borderRadius: 6,
                          padding: ".3rem .6rem",
                          fontSize: ".78rem",
                          fontWeight: 600,
                          cursor: downloadingType === item.type_piece ? "wait" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {downloadingType === item.type_piece ? "…" : "Télécharger"}
                      </button>
                    )}

                    {/* Input d'upload */}
                    <input
                      type="file"
                      aria-label={`Uploader ${PIECE_LABELS[item.type_piece]}`}
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      disabled={uploadingType === item.type_piece || detail.status === "depose"}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        uploadPiece(item.type_piece, file);
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Soumission */}
              <div style={{ marginTop: "1rem" }}>
                {!showSummary ? (
                  <button
                    type="button"
                    disabled={!detail.can_submit || submitting || detail.status === "depose"}
                    onClick={() => setShowSummary(true)}
                    style={{
                      background:
                        !detail.can_submit || detail.status === "depose" ? "#9ca3af" : "var(--navy)",
                      color: "#fff",
                      border: 0,
                      padding: ".75rem 1.25rem",
                      borderRadius: 8,
                      cursor:
                        !detail.can_submit || detail.status === "depose" ? "not-allowed" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Voir le récapitulatif avant soumission
                  </button>
                ) : (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "1rem 1.25rem",
                    }}
                  >
                    <h3 style={{ marginTop: 0, fontFamily: "Syne, sans-serif" }}>
                      Récapitulatif avant confirmation
                    </h3>
                    <p style={{ margin: ".25rem 0" }}>Référence : {detail.reference}</p>
                    <p style={{ margin: ".25rem 0" }}>Type : {detail.type.toUpperCase()}</p>
                    <p style={{ margin: ".25rem 0" }}>
                      Pièces uploadées : {detail.checklist.filter((item) => item.uploaded).length}/5
                    </p>
                    <div style={{ display: "flex", gap: ".6rem", marginTop: ".9rem" }}>
                      <button
                        type="button"
                        onClick={submitDossier}
                        disabled={submitting}
                        style={{
                          background: "var(--navy)",
                          color: "#fff",
                          border: 0,
                          padding: ".7rem 1rem",
                          borderRadius: 8,
                          cursor: submitting ? "not-allowed" : "pointer",
                          fontWeight: 600,
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
                          padding: ".7rem 1rem",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
                {submitMessage && (
                  <p style={{ color: "#166534", marginTop: ".75rem" }}>{submitMessage}</p>
                )}
              </div>
            </div>

            {/* ── Historique des statuts ───────────────────────── */}
            {detail.historique && detail.historique.length > 0 && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.25rem 1.5rem",
                  boxShadow: "var(--shadow)",
                }}
              >
                <h2
                  style={{
                    fontFamily: "Syne, sans-serif",
                    fontSize: "1rem",
                    marginBottom: "1rem",
                    color: "var(--navy)",
                  }}
                >
                  Historique du dossier
                </h2>
                <ol
                  aria-label="Historique des changements de statut"
                  style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: ".75rem" }}
                >
                  {detail.historique.map((entry, index) => (
                    <li
                      key={index}
                      style={{
                        display: "flex",
                        gap: "1rem",
                        alignItems: "flex-start",
                        paddingBottom: ".75rem",
                        borderBottom:
                          index < (detail.historique?.length ?? 0) - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <span
                        style={{
                          flex: "0 0 auto",
                          color: "var(--muted)",
                          fontSize: ".8rem",
                          paddingTop: ".15rem",
                          whiteSpace: "nowrap",
                        }}
                      >
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
      </section>
    </main>
  );
}
