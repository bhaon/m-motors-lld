"use client";

import { useEffect, useState } from "react";

/**
 * Résout l'URL backend de confirmation email.
 */
function resolveConfirmUrl(token: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  const path = `/api/v1/auth/confirm-email?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

export default function ConfirmEmailPage() {
  const [message, setMessage] = useState("Validation de votre email en cours...");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setIsError(true);
      setMessage("Lien de confirmation invalide.");
      return;
    }

    async function confirmEmail() {
      try {
        const response = await fetch(resolveConfirmUrl(token));
        const payload = (await response.json()) as { message?: string; detail?: string };
        if (!response.ok) {
          throw new Error(payload.detail || "Confirmation impossible.");
        }
        setMessage(payload.message || "Votre email est confirme.");
      } catch (e) {
        setIsError(true);
        setMessage(e instanceof Error ? e.message : "Erreur technique.");
      }
    }

    confirmEmail();
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "1.5rem", textAlign: "center" }}>
      <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Confirmation de l&apos;email</h1>
      <p style={{ color: isError ? "#b91c1c" : "#166534" }}>{message}</p>
    </main>
  );
}
