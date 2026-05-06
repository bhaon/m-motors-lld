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

/**
 * Lit la reponse HTTP en JSON si possible, sinon en texte.
 */
async function readApiPayload(response: Response): Promise<{ message?: string; detail?: string }> {
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as { message?: string; detail?: string };
  }
  if (typeof response.json === "function") {
    try {
      return (await response.json()) as { message?: string; detail?: string };
    } catch {
      // Le fallback texte ci-dessous couvre les réponses non-JSON.
    }
  }
  if (typeof response.text !== "function") {
    return {};
  }
  const text = await response.text();
  return { detail: text || undefined };
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
    const confirmedToken = token;

    async function confirmEmail() {
      try {
        const response = await fetch(resolveConfirmUrl(confirmedToken));
        const payload = await readApiPayload(response);
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
