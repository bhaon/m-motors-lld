"use client";

import Navbar from "@/components/Navbar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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
const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
 * Calcule le SHA-256 d'un fichier navigateur et renvoie un hexadécimal.
 */
async function computeFileSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convertit un checksum hexadécimal SHA-256 en base64 pour l'API S3.
 */
function sha256HexToBase64(hex: string): string {
  const pairs = hex.match(/.{1,2}/g) || [];
  const bytes = new Uint8Array(pairs.map((pair) => parseInt(pair, 16)));
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
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
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadingType, setUploadingType] = useState<PieceType | null>(null);

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

  /**
   * Upload une pièce manquante directement depuis la fiche dossier.
   */
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
      <section style={{ maxWidth: 980, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <Link href="/mes-dossiers" style={{ display: "inline-block", marginBottom: ".8rem", textDecoration: "underline", color: "var(--navy)" }}>
          ← Retour à mes dossiers
        </Link>
        {loading ? <p>Chargement du dossier...</p> : null}
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {uploadMessage ? <p style={{ color: "#166534" }}>{uploadMessage}</p> : null}

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
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: ".75rem",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                    <span>{PIECE_LABELS[item.type_piece]}</span>
                    <strong style={{ color: item.uploaded ? "#15803d" : "#b45309" }}>{item.uploaded ? "Uploadée" : "Manquante"}</strong>
                  </div>
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
