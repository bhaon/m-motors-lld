"use client";

import { useEffect } from "react";
import { Vehicle } from "@/types";

interface DossierConfirmModalProps {
  vehicle: Vehicle;
  type: "lld" | "achat";
  onConfirm: () => void;
  onCancel: () => void;
  /** Désactive le bouton de confirmation pendant la lecture de la session (cookie `/me`). */
  confirmLocked?: boolean;
}

/**
 * Modale de confirmation avant création effective du dossier.
 */
export default function DossierConfirmModal({
  vehicle,
  type,
  onConfirm,
  onCancel,
  confirmLocked = false,
}: Readonly<DossierConfirmModalProps>) {
  useEffect(() => {
    /**
     * Annule le dépôt si l'utilisateur appuie sur Échap.
     */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    globalThis.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [onCancel]);

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
        aria-label="Annuler le dépôt (fond de modale)"
        onClick={onCancel}
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
          maxWidth: "560px",
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid var(--border)",
          padding: "1.25rem",
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        <h3 style={{ fontFamily: "Syne, sans-serif", marginBottom: ".5rem" }}>
          Confirmer le dépôt du dossier
        </h3>
        <p style={{ color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Vous allez créer un dossier <strong>{type.toUpperCase()}</strong> pour{" "}
          <strong>
            {vehicle.make} {vehicle.model}
          </strong>
          . Vous pourrez compléter les pièces ensuite.
        </p>

        <div style={{ display: "flex", gap: ".75rem" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              background: "#fff",
              color: "var(--navy)",
              border: "1.5px solid var(--navy)",
              padding: ".75rem",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmLocked}
            style={{
              flex: 1,
              background: confirmLocked ? "#9ca3af" : "var(--navy)",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              fontWeight: 600,
              cursor: confirmLocked ? "not-allowed" : "pointer",
            }}
          >
            {confirmLocked ? "Vérification de la session…" : "Confirmer le dépôt"}
          </button>
        </div>
      </div>
    </div>
  );
}
