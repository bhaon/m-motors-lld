"use client";

/**
 * Modale d'upload des 5 pièces justificatives obligatoires d'un dossier.
 * Délègue la logique d'upload à useFileUpload (init→PUT MinIO→complete).
 */

import { useState } from "react";
import { useFileUpload, PieceType } from "@/hooks/useFileUpload";

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

export default function DossierPiecesModal({
  dossierId,
  dossierReference,
  onClose,
}: Readonly<DossierPiecesModalProps>) {
  const { uploadingType, error, uploadPiece } = useFileUpload(String(dossierId));

  // Suivi local des pièces uploadées dans cette session
  const [completed, setCompleted] = useState<Record<PieceType, boolean>>({
    cni: false, permis: false, revenus: false, domicile: false, rib: false,
  });

  const completedCount = Object.values(completed).filter(Boolean).length;

  function handleFileChange(type: PieceType, file: File) {
    uploadPiece(type, file, (done) =>
      setCompleted((prev) => ({ ...prev, [done]: true }))
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <button type="button" aria-label="Fermer la modale pièces" onClick={onClose}
        style={{ position: "absolute", inset: 0, border: "none", width: "100%", height: "100%", background: "rgba(0,0,0,.55)", cursor: "pointer" }} />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "780px", background: "#fff", borderRadius: "14px", border: "1px solid var(--border)", padding: "1.25rem" }}>
        <h3 style={{ fontFamily: "Syne, sans-serif", marginBottom: ".35rem" }}>Dépôt des pièces justificatives</h3>
        <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
          Dossier <strong>{dossierReference}</strong> — {completedCount}/5 pièces validées.
        </p>
        <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: "1rem" }}>
          Formats acceptés : PDF, JPG, PNG — Taille max 10 Mo par fichier.
        </p>

        <div style={{ display: "grid", gap: ".75rem" }}>
          {REQUIRED_PIECES.map((piece) => (
            <label key={piece.type}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: ".65rem", border: "1px solid var(--border)", borderRadius: 8, padding: ".7rem .85rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                <span>{piece.label}</span>
                {completed[piece.type] && (
                  <span style={{ color: "#15803d", fontWeight: 700 }}>✓ Uploadé</span>
                )}
              </div>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={uploadingType === piece.type}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileChange(piece.type, file); }}
              />
            </label>
          ))}
        </div>
        {error && <p style={{ color: "#b91c1c", marginTop: ".75rem" }}>{error}</p>}
      </div>
    </div>
  );
}
