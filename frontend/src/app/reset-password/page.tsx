"use client";

import { FormEvent, useState } from "react";
import Navbar from "@/components/Navbar";

/**
 * Résout l'URL backend de confirmation de réinitialisation.
 */
function resolveResetPasswordUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/reset-password";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/reset-password`;
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

export default function ResetPasswordPage() {
  const token = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /**
   * Soumet le nouveau mot de passe et invalide immédiatement l'ancien.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (!token) {
        throw new Error("Lien de reinitialisation invalide.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("Les mots de passe ne correspondent pas.");
      }
      const response = await fetch(resolveResetPasswordUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(payload.detail || "Reinitialisation impossible.");
      }
      setMessage(payload.message || "Mot de passe reinitialise avec succes.");
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
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Réinitialiser mon mot de passe</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem" }}>
          <input
            placeholder="Nouveau mot de passe"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            placeholder="Confirmer le mot de passe"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            style={{
              background: loading || !newPassword || !confirmPassword ? "#9ca3af" : "var(--navy)",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              cursor: loading || !newPassword || !confirmPassword ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
          {message ? <p style={{ color: "#166534" }}>{message}</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
