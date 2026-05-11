"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isPasswordStrong } from "@/lib/validation";

type AuthTab = "login" | "register";

type RegisterPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  accepted_cgu: boolean;
  accepted_privacy_policy: boolean;
};

export type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  /** Onglet affiché à l’ouverture (resynchronisé quand `open` passe à true). */
  defaultTab: AuthTab;
  /** Appelé après une connexion réussie (ex. rafraîchir la navbar). Attendu avant fermeture de la modale. */
  onAuthenticated?: () => void | Promise<void>;
  /** Si false, ne redirige pas vers `/` après connexion (ex. dépôt catalogue avec modale ouverte). */
  redirectAfterLogin?: boolean;
};

function resolveLoginUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/login";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/login`;
}

function resolveRegisterUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/register";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/register`;
}

function resolveResendConfirmationUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/resend-confirmation";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/resend-confirmation`;
}

/** Lit la réponse API en JSON si possible, sinon texte brut. */
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

const EMAIL_NOT_VERIFIED_ERROR =
  "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.";

/**
 * Modale unique : connexion (cookie session) et inscription (formulaire complet).
 */
export default function AuthModal({
  open,
  onClose,
  defaultTab,
  onAuthenticated,
  redirectAfterLogin = true,
}: AuthModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>(defaultTab);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [resending, setResending] = useState(false);

  const [form, setForm] = useState<RegisterPayload>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    birth_date: "",
    accepted_cgu: false,
    accepted_privacy_policy: false,
  });
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  const isSubmitDisabled = useMemo(() => {
    return (
      registerLoading ||
      !form.email ||
      !form.password ||
      !form.first_name ||
      !form.last_name ||
      !form.birth_date ||
      !form.accepted_cgu ||
      !form.accepted_privacy_policy ||
      !isPasswordStrong(form.password)
    );
  }, [form, registerLoading]);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
  }, [open, defaultTab]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /** Soumet le formulaire de connexion puis redirige vers l'espace client. */
  async function onLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setResendStatus("");
    setShowResend(false);
    setLoginLoading(true);
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
      await Promise.resolve(onAuthenticated?.());
      onClose();
      if (redirectAfterLogin) {
        router.push("/");
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Email ou mot de passe invalide.");
    } finally {
      setLoginLoading(false);
    }
  }

  /** Réémet l'email de confirmation avec les mêmes identifiants. */
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

  /** Soumet le formulaire d'inscription. */
  async function onRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterError("");
    setRegisterSuccess("");
    setRegisterLoading(true);
    try {
      const response = await fetch(resolveRegisterUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(payload.detail || "Inscription impossible.");
      }
      setRegisterSuccess(payload.message || "Inscription reussie. Verifiez votre email.");
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setRegisterLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 520,
          width: "100%",
          padding: "1.5rem",
          boxShadow: "0 25px 60px rgba(0,0,0,.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem", borderBottom: "1px solid #e2e8f0", paddingBottom: 12 }}>
          <button
            type="button"
            onClick={() => setTab("login")}
            style={{
              flex: 1,
              padding: "10px 12px",
              border: 0,
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
              background: tab === "login" ? "var(--navy)" : "#f1f5f9",
              color: tab === "login" ? "#fff" : "#334155",
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            style={{
              flex: 1,
              padding: "10px 12px",
              border: 0,
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
              background: tab === "register" ? "var(--navy)" : "#f1f5f9",
              color: tab === "register" ? "#fff" : "#334155",
            }}
          >
            Inscription
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h1 id="auth-modal-title" style={{ fontFamily: "Syne, sans-serif", fontSize: "1.25rem", margin: 0 }}>
            {tab === "login" ? "Accès à votre espace client" : "Créer un compte client"}
          </h1>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{
              border: 0,
              background: "transparent",
              fontSize: "1.5rem",
              lineHeight: 1,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ×
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={(e) => void onLoginSubmit(e)} style={{ display: "grid", gap: "0.9rem" }}>
            <input placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              placeholder="Mot de passe"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Link href="/mot-de-passe-oublie" onClick={onClose} style={{ fontSize: ".9rem", color: "#0f172a", textDecoration: "underline" }}>
              Mot de passe oublié ?
            </Link>
            <button
              type="submit"
              disabled={loginLoading || !email || !password}
              style={{
                background: loginLoading || !email || !password ? "#9ca3af" : "var(--navy)",
                color: "#fff",
                border: 0,
                padding: ".75rem",
                borderRadius: 8,
                cursor: loginLoading || !email || !password ? "not-allowed" : "pointer",
              }}
            >
              {loginLoading ? "Connexion..." : "Se connecter"}
            </button>
            {loginError ? <p style={{ color: "#b91c1c" }}>{loginError}</p> : null}
            {showResend ? (
              <div style={{ display: "grid", gap: ".5rem" }}>
                <button
                  type="button"
                  onClick={() => void onResendConfirmation()}
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
                {resendStatus ? (
                  <p style={{ color: resendStatus === "Erreur technique." ? "#b91c1c" : "#166534" }}>{resendStatus}</p>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : (
          <form onSubmit={(e) => void onRegisterSubmit(e)} style={{ display: "grid", gap: "0.9rem" }}>
            <input placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input
              placeholder="Mot de passe"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <input placeholder="Prenom" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <input placeholder="Nom" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <input type="date" required value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            <label style={{ display: "flex", gap: 8 }}>
              <input type="checkbox" checked={form.accepted_cgu} onChange={(e) => setForm({ ...form, accepted_cgu: e.target.checked })} />
              J&apos;accepte les CGU
            </label>
            <label style={{ display: "flex", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.accepted_privacy_policy}
                onChange={(e) => setForm({ ...form, accepted_privacy_policy: e.target.checked })}
              />
              J&apos;accepte la politique de confidentialite
            </label>
            <p style={{ color: "#6b7280", fontSize: ".85rem" }}>
              Mot de passe requis: 12 caracteres minimum, 1 majuscule, 1 chiffre, 1 caractere special.
            </p>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              style={{
                background: isSubmitDisabled ? "#9ca3af" : "var(--navy)",
                color: "#fff",
                border: 0,
                padding: ".75rem",
                borderRadius: 8,
                cursor: isSubmitDisabled ? "not-allowed" : "pointer",
                opacity: isSubmitDisabled ? 0.8 : 1,
              }}
            >
              {registerLoading ? "Inscription..." : "S'inscrire"}
            </button>
            {registerError ? <p style={{ color: "#b91c1c" }}>{registerError}</p> : null}
            {registerSuccess ? <p style={{ color: "#166534" }}>{registerSuccess}</p> : null}
          </form>
        )}
      </div>
    </div>
  );
}
