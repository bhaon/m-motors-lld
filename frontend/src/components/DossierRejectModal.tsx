"use client";

import { useEffect, useMemo, useState } from "react";

/** Nombre minimum de caractères pour le motif de rejet (aligné sur l'API). */
export const MOTIF_REJET_MIN_LENGTH = 20;

interface DossierRejectModalProps {
  dossierReference: string;
  submitting: boolean;
  onConfirm: (motif: string) => void;
  onCancel: () => void;
}

/**
 * Modale de saisie du motif obligatoire avant rejet d'un dossier (US-06-05).
 */
export default function DossierRejectModal({
  dossierReference,
  submitting,
  onConfirm,
  onCancel,
}: Readonly<DossierRejectModalProps>) {
  const [motif, setMotif] = useState("");

  const motifTrimmed = useMemo(() => motif.trim(), [motif]);
  const canSubmit = motifTrimmed.length >= MOTIF_REJET_MIN_LENGTH && !submitting;

  useEffect(() => {
    /**
     * Ferme la modale si l'utilisateur appuie sur Échap (sauf pendant l'envoi).
     */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onCancel();
    }
    globalThis.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [onCancel, submitting]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <button
        type="button"
        aria-label="Annuler le rejet (fond de modale)"
        disabled={submitting}
        onClick={onCancel}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,.55)",
          cursor: submitting ? "default" : "pointer",
        }}
      />

      <div
        role="dialog"
        aria-labelledby="reject-modal-title"
        aria-modal="true"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "560px",
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid var(--border)",
          padding: "1.25rem",
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        <h3 id="reject-modal-title" style={{ fontFamily: "Syne, sans-serif", marginBottom: ".5rem", color: "var(--navy)" }}>
          Rejeter le dossier {dossierReference}
        </h3>
        <p style={{ color: "var(--muted)", marginBottom: ".75rem", lineHeight: 1.5, fontSize: ".9rem" }}>
          Le motif sera communiqué au client par email et affiché dans son espace. Minimum{" "}
          {MOTIF_REJET_MIN_LENGTH} caractères.
        </p>

        <label htmlFor="motif-rejet" style={{ display: "block", fontWeight: 600, fontSize: ".85rem", marginBottom: ".35rem" }}>
          Motif de rejet <span style={{ color: "#b91c1c" }}>*</span>
        </label>
        <textarea
          id="motif-rejet"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={5}
          disabled={submitting}
          placeholder="Expliquez les raisons du refus…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: ".65rem .75rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontFamily: "inherit",
            fontSize: ".9rem",
            resize: "vertical",
            minHeight: "120px",
          }}
        />
        <p style={{ margin: ".35rem 0 1rem", fontSize: ".78rem", color: motifTrimmed.length >= MOTIF_REJET_MIN_LENGTH ? "#15803d" : "#b45309" }}>
          {motifTrimmed.length} / {MOTIF_REJET_MIN_LENGTH} caractères minimum
        </p>

        <div style={{ display: "flex", gap: ".75rem" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              flex: 1,
              background: "#fff",
              color: "var(--navy)",
              border: "1.5px solid var(--navy)",
              padding: ".75rem",
              borderRadius: 8,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            aria-label="Confirmer le rejet du dossier"
            disabled={!canSubmit}
            onClick={() => onConfirm(motifTrimmed)}
            style={{
              flex: 1,
              background: canSubmit ? "#b91c1c" : "#fca5a5",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Envoi…" : "Confirmer le rejet"}
          </button>
        </div>
      </div>
    </div>
  );
}
