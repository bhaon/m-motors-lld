"use client";

import { useState } from "react";
import { computeFileSha256Hex, sha256HexToBase64 } from "@/lib/sha256";
import { apiUrl } from "@/lib/api";

/** Types de pièces justificatives requis pour un dossier. */
export type PieceType = "cni" | "permis" | "revenus" | "domicile" | "rib";

const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo

/**
 * Gère l'upload complet d'une pièce justificative vers MinIO en 3 étapes :
 * 1. POST /pieces/upload-init  → URL pré-signée + en-têtes S3
 * 2. PUT presigned URL         → fichier envoyé directement à MinIO
 * 3. POST /pieces/upload-complete → confirmation + vérification SHA-256
 *
 * @param dossierId — identifiant du dossier (string depuis useParams).
 */
export function useFileUpload(dossierId: string) {
  const [uploadingType, setUploadingType] = useState<PieceType | null>(null);
  const [error, setError] = useState("");

  /** URL de base des pièces (construction lazy pour éviter les closures obsolètes). */
  function piecesUrl() {
    return apiUrl(`/api/v1/dossiers/${dossierId}/pieces`);
  }

  /**
   * Lance l'upload pour une pièce.
   * Appelle `onSuccess(type)` quand le cycle init→PUT→complete réussit.
   * En cas d'erreur, met à jour `error` et abandonne sans appeler `onSuccess`.
   */
  async function uploadPiece(
    type: PieceType,
    file: File,
    onSuccess: (type: PieceType) => void | Promise<void>,
  ): Promise<void> {
    setError("");

    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Format invalide : utilisez PDF, JPG ou PNG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Fichier trop volumineux : 10 Mo maximum.");
      return;
    }

    setUploadingType(type);
    try {
      const checksumHex = await computeFileSha256Hex(file);
      const checksumBase64 = sha256HexToBase64(checksumHex);
      const base = piecesUrl();

      // Étape 1 — obtenir l'URL pré-signée
      const initRes = await fetch(`${base}/upload-init`, {
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
      const initPayload = (await initRes.json().catch(() => ({}))) as {
        upload_url?: string;
        s3_key?: string;
        headers?: Record<string, string>;
        detail?: string;
      };
      if (!initRes.ok || !initPayload.upload_url || !initPayload.s3_key || !initPayload.headers) {
        throw new Error(initPayload.detail ?? "Pré-signature impossible.");
      }

      // Étape 2 — envoi direct vers MinIO
      const putRes = await fetch(initPayload.upload_url, {
        method: "PUT",
        headers: initPayload.headers,
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload MinIO échoué.");

      // Étape 3 — confirmation + vérification SHA-256
      const completeRes = await fetch(`${base}/upload-complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_piece: type,
          filename: file.name,
          s3_key: initPayload.s3_key,
          checksum_sha256: checksumHex, // hex pour le backend (différent du base64 S3)
        }),
      });
      const completePayload = (await completeRes.json().catch(() => ({}))) as { detail?: string };
      if (!completeRes.ok) throw new Error(completePayload.detail ?? "Validation du document impossible.");

      await Promise.resolve(onSuccess(type));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'upload.");
    } finally {
      setUploadingType(null);
    }
  }

  return { uploadingType, error, setError, uploadPiece };
}
