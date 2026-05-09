"use client";

/**
 * Boundary d'erreur pour toutes les routes /backoffice/*.
 * Capte les erreurs de rendu React et les rejets de fetch non gérés.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function BackofficeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En production, envoyer l'erreur à un service de monitoring
    console.error("[backoffice]", error);
  }, [error]);

  return (
    <main style={{ maxWidth: 560, margin: "6rem auto", padding: "0 1.5rem", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.5 }}>⚠️</div>
      <h2 style={{ fontFamily: "Syne, sans-serif", color: "var(--navy)", marginBottom: ".75rem" }}>
        Erreur back-office
      </h2>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
        Une erreur inattendue s&apos;est produite. Si le problème persiste, contactez l&apos;administrateur.
      </p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button
          type="button"
          onClick={reset}
          style={{ padding: "9px 22px", background: "var(--navy)", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
        >
          Réessayer
        </button>
        <Link href="/" style={{ padding: "9px 22px", border: "1px solid #d1d5db", borderRadius: 8, color: "#374151", textDecoration: "none", fontWeight: 600 }}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
