"use client";

import { FormEvent, useState } from "react";
import Navbar from "@/components/Navbar";

/**
 * Résout l'URL backend de demande de réinitialisation.
 */
function resolveForgotPasswordUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/forgot-password";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/forgot-password`;
}

/**
 * Lit la réponse API en JSON si possible.
 */
async function readApiPayload(response: Response): Promise<{ message?: string; detail?: string }> {
  const clonedResponse = typeof response.clone === "function" ? response.clone() : null;
  if (typeof response.json === "function") {
    try {
      return (await response.json()) as { message?: string; detail?: string };
    } catch {
      // Fallback texte ci-dessous.
    }
  }
  if (typeof clonedResponse?.text !== "function") {
    return {};
  }
  const body = await clonedResponse.text();
  return body ? { detail: body } : {};
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /**
   * Soumet la demande de réinitialisation et affiche un message d'information.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(resolveForgotPasswordUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(payload.detail || "Demande impossible.");
      }
      setMessage(payload.message || "Si un compte existe, un email de réinitialisation a été envoyé.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <Navbar />
      <section style={{ maxWidth: 560, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Mot de passe oublié</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem" }}>
          <input placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button
            type="submit"
            disabled={loading || !email}
            style={{
              background: loading || !email ? "#9ca3af" : "var(--navy)",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              cursor: loading || !email ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Envoi..." : "Envoyer un lien de réinitialisation"}
          </button>
          {message ? <p style={{ color: "#166534" }}>{message}</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
