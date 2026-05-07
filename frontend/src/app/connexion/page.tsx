"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

/**
 * Résout l'URL backend de connexion (client uniquement).
 */
function resolveLoginUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/login";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/login`;
}

/**
 * Résout l'URL backend pour réémettre l'email de confirmation.
 */
function resolveResendConfirmationUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/resend-confirmation";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/resend-confirmation`;
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

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendStatus, setResendStatus] = useState<string>("");
  const [resending, setResending] = useState(false);

  const EMAIL_NOT_VERIFIED_ERROR =
    "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.";

  /**
   * Soumet le formulaire de connexion puis redirige vers l'espace client.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResendStatus("");
    setShowResend(false);
    setLoading(true);
    try {
      const response = await fetch(resolveLoginUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        const detail = payload.detail || "Email ou mot de passe invalide.";
        if (detail === EMAIL_NOT_VERIFIED_ERROR) {
          setShowResend(true);
        }
        throw new Error(detail);
      }
      router.push("/espace-client");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email ou mot de passe invalide.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Réémet l'email de confirmation avec les mêmes identifiants.
   */
  async function onResendConfirmation() {
    setResendStatus("");
    setResending(true);
    try {
      const response = await fetch(resolveResendConfirmationUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(payload.detail || "Réémission impossible.");
      }
      setResendStatus(payload.message || "Un nouvel email de confirmation a été envoyé.");
    } catch (e) {
      setResendStatus(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main>
      <Navbar />
      <section style={{ maxWidth: 560, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Connexion a votre espace client</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem" }}>
          <input placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Mot de passe" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              background: loading || !email || !password ? "#9ca3af" : "var(--navy)",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              cursor: loading || !email || !password ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          {showResend ? (
            <div style={{ display: "grid", gap: ".5rem" }}>
              <button
                type="button"
                onClick={onResendConfirmation}
                disabled={resending || !email || !password}
                style={{
                  background: resending || !email || !password ? "#9ca3af" : "#0f172a",
                  color: "#fff",
                  border: 0,
                  padding: ".75rem",
                  borderRadius: 8,
                  cursor: resending || !email || !password ? "not-allowed" : "pointer",
                }}
              >
                {resending ? "Envoi..." : "Renvoyer l'email de confirmation"}
              </button>
              {resendStatus ? <p style={{ color: resendStatus === "Erreur technique." ? "#b91c1c" : "#166534" }}>{resendStatus}</p> : null}
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
