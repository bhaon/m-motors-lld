"use client";

import { useEffect } from "react";
import Link from "next/link";

import { getLogger } from "@/lib/logger";

const log = getLogger("app.mes-dossiers.error");

/** Boundary d'erreur pour /mes-dossiers et /mes-dossiers/[id]. */
export default function MesDossiersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error("boundary erreur mes-dossiers", { digest: error.digest }, error);
  }, [error]);

  return (
    <main style={{ maxWidth: 560, margin: "6rem auto", padding: "0 1.5rem", textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.5 }}>⚠️</div>
      <h2 style={{ fontFamily: "Syne, sans-serif", color: "var(--navy)", marginBottom: ".75rem" }}>
        Impossible de charger votre dossier
      </h2>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
        Une erreur s&apos;est produite lors du chargement. Réessayez ou retournez à la liste.
      </p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <button type="button" onClick={reset}
          style={{ padding: "9px 22px", background: "var(--navy)", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
          Réessayer
        </button>
        <Link href="/mes-dossiers" style={{ padding: "9px 22px", border: "1px solid #d1d5db", borderRadius: 8, color: "#374151", textDecoration: "none", fontWeight: 600 }}>
          Mes dossiers
        </Link>
      </div>
    </main>
  );
}
