"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

/** Construit l'URL backend GET /auth/confirm-avenant-signature (US-06-08). */
function resolveConfirmUrl(token: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  const path = `/api/v1/auth/confirm-avenant-signature?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

async function readApiPayload(response: Response): Promise<{ message?: string; detail?: string }> {
  const clonedResponse = typeof response.clone === "function" ? response.clone() : null;
  if (typeof response.json === "function") {
    try {
      return (await response.json()) as { message?: string; detail?: string };
    } catch {
      /* suite */
    }
  }
  if (typeof clonedResponse?.text !== "function") {
    return {};
  }
  const body = await clonedResponse.text();
  if (!body) {
    return {};
  }
  return { detail: body };
}

/**
 * Page publique : le client ouvre le lien reçu par e-mail pour signer l’avenant aux options LLD.
 */
export default function ConfirmAvenantSignaturePage() {
  const [message, setMessage] = useState("Validation de votre signature en cours...");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setIsError(true);
      setMessage("Lien de confirmation invalide.");
      return;
    }
    const confirmedToken = token;

    async function confirmAvenant() {
      try {
        const response = await fetch(resolveConfirmUrl(confirmedToken));
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(payload.detail || "Confirmation impossible.");
        }
        setMessage(payload.message || "Avenant signé.");
      } catch (e) {
        setIsError(true);
        setMessage(e instanceof Error ? e.message : "Erreur technique.");
      }
    }

    void confirmAvenant();
  }, []);

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            color: "var(--navy)",
            fontFamily: "Syne, sans-serif",
            marginBottom: "1rem",
          }}
        >
          Signature de l&apos;avenant
        </h1>
        <p
          role="status"
          aria-live="polite"
          style={{
            color: isError ? "#b91c1c" : "#166534",
            fontSize: "1rem",
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
      </main>
    </>
  );
}
