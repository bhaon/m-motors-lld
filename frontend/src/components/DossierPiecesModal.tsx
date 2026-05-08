"use client";

import { useMemo, useState } from "react";

type PieceType = "cni" | "permis" | "revenus" | "domicile" | "rib";

interface DossierPiecesModalProps {
  dossierId: number;
  dossierReference: string;
  onClose: () => void;
}

const REQUIRED_PIECES: { type: PieceType; label: string }[] = [
  { type: "cni", label: "CNI" },
  { type: "permis", label: "Permis de conduire" },
  { type: "revenus", label: "Justificatif de revenus" },
  { type: "domicile", label: "Justificatif de domicile" },
  { type: "rib", label: "RIB" },
];

const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
 * Résout l'URL backend de gestion des pièces justificatives.
 */
function resolveDossierPiecesBaseUrl(dossierId: number): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base
    ? `${base}/api/v1/dossiers/${dossierId}/pieces`
    : `/api/v1/dossiers/${dossierId}/pieces`;
}

/**
 * Modale d'upload des 5 pièces obligatoires d'un dossier client.
 */
export default function DossierPiecesModal({
  dossierId,
  dossierReference,
  onClose,
}: Readonly<DossierPiecesModalProps>) {
  const [uploaded, setUploaded] = useState<Record<PieceType, boolean>>({
    cni: false,
    permis: false,
    revenus: false,
    domicile: false,
    rib: false,
  });
  const [loadingType, setLoadingType] = useState<PieceType | null>(null);
  const [error, setError] = useState("");

  /**
   * Calcule l'avancement global du dépôt des justificatifs.
   */
  const completedCount = useMemo(
    () => Object.values(uploaded).filter(Boolean).length,
    [uploaded],
  );

  /**
   * Lance un upload complet: validation locale, URL pré-signée, PUT MinIO, confirmation API.
   */
  async function uploadPiece(type: PieceType, file: File) {
    setError("");
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Format invalide: utilisez PDF, JPG ou PNG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Fichier trop volumineux: 10 Mo maximum.");
      return;
    }
    setLoadingType(type);
    try {
      const checksumHex = await computeFileSha256Hex(file);
      const checksumBase64 = sha256HexToBase64(checksumHex);
      const baseUrl = resolveDossierPiecesBaseUrl(dossierId);
      const initResponse = await fetch(`${baseUrl}/upload-init`, {
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
      const initPayload = (await initResponse.json()) as {
        upload_url: string;
        s3_key: string;
        headers: Record<string, string>;
        detail?: string;
      };
      if (!initResponse.ok) {
        throw new Error(initPayload.detail || "Pré-signature impossible.");
      }

      const uploadResponse = await fetch(initPayload.upload_url, {
        method: "PUT",
        headers: initPayload.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Upload MinIO échoué.");
      }

      const completeResponse = await fetch(`${baseUrl}/upload-complete`, {
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
      const completePayload = (await completeResponse.json()) as { detail?: string };
      if (!completeResponse.ok) {
        throw new Error(completePayload.detail || "Validation checksum impossible.");
      }
      setUploaded((current) => ({ ...current, [type]: true }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Erreur d'upload.");
    } finally {
      setLoadingType(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <button
        type="button"
        aria-label="Fermer la modale pièces"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,.55)",
          cursor: "pointer",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "780px",
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid var(--border)",
          padding: "1.25rem",
        }}
      >
        <h3 style={{ fontFamily: "Syne, sans-serif", marginBottom: ".35rem" }}>
          Dépôt des pièces justificatives
        </h3>
        <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
          Dossier <strong>{dossierReference}</strong> - {completedCount}/5 pièces validées.
        </p>
        <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: "1rem" }}>
          Formats acceptés : PDF, JPG, PNG - Taille max 10 Mo par fichier.
        </p>

        <div style={{ display: "grid", gap: ".75rem" }}>
          {REQUIRED_PIECES.map((piece) => (
            <label
              key={piece.type}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: ".65rem",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: ".7rem .85rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                <span>{piece.label}</span>
                {uploaded[piece.type] ? (
                  <span style={{ color: "#15803d", fontWeight: 700 }}>
                    ✓ Uploadé
                  </span>
                ) : null}
              </div>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={loadingType === piece.type}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  uploadPiece(piece.type, file);
                }}
              />
            </label>
          ))}
        </div>
        {error ? <p style={{ color: "#b91c1c", marginTop: ".75rem" }}>{error}</p> : null}
      </div>
    </div>
  );
}
