"use client";

import { FormEvent, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { isPasswordStrong } from "@/lib/validation";

type RegisterPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  accepted_cgu: boolean;
  accepted_privacy_policy: boolean;
};

/**
 * Construit l'URL backend d'inscription (client uniquement).
 */
function resolveRegisterUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!pub) return "/api/v1/auth/register";
  return `${pub.replace(/\/$/, "")}/api/v1/auth/register`;
}


/**
 * Lit la reponse HTTP en JSON si possible, sinon en texte.
 */
async function readApiPayload(response: Response): Promise<{ message?: string; detail?: string }> {
  const clonedResponse = typeof response.clone === "function" ? response.clone() : null;
  if (typeof response.json === "function") {
    try {
      return (await response.json()) as { message?: string; detail?: string };
    } catch {
      // On tente ensuite de récupérer un message texte via le clone.
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

export default function InscriptionPage() {
  // Etat contrôlé de tous les champs du formulaire d'inscription.
  const [form, setForm] = useState<RegisterPayload>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    birth_date: "",
    accepted_cgu: false,
    accepted_privacy_policy: false,
  });
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  // loading bloque les doubles soumissions et change le libellé du bouton.
  const [loading, setLoading] = useState(false);

  // Règles de désactivation centralisées pour garder un rendu simple côté JSX.
  const isSubmitDisabled = useMemo(() => {
    return (
      loading ||
      !form.email ||
      !form.password ||
      !form.first_name ||
      !form.last_name ||
      !form.birth_date ||
      !form.accepted_cgu ||
      !form.accepted_privacy_policy ||
      !isPasswordStrong(form.password)
    );
  }, [form, loading]);

  /**
   * Soumet le formulaire d'inscription et affiche le message de confirmation.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Empêche le rechargement natif de la page lors du submit HTML.
    event.preventDefault();
    // Remise à zéro des messages à chaque tentative.
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      // Envoi du payload tel que l'API backend l'attend.
      const response = await fetch(resolveRegisterUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      // Lecture robuste du body (JSON ou texte) sans double consommation du flux.
      const payload = await readApiPayload(response);
      if (!response.ok) {
        // On privilégie le message backend quand il est disponible.
        throw new Error(payload.detail || "Inscription impossible.");
      }
      // Message de succès orienté action utilisateur (confirmation email).
      setSuccess(payload.message || "Inscription reussie. Verifiez votre email.");
    } catch (e) {
      // Uniformise la surface d'erreur, quelle que soit la source.
      setError(e instanceof Error ? e.message : "Erreur technique.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <Navbar />
      <section style={{ maxWidth: 560, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Creer un compte client</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.9rem" }}>
          {/* Les inputs restent contrôlés pour garder un état unique et prédictible. */}
          <input placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Mot de passe" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input placeholder="Prenom" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input placeholder="Nom" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input type="date" required value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          {/* Consentements légaux obligatoires : blocants pour l'activation du bouton. */}
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
              // Le gris indique visuellement l'état inactif.
              background: isSubmitDisabled ? "#9ca3af" : "var(--navy)",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              // Retour visuel explicite pour l'accessibilité et la compréhension.
              cursor: isSubmitDisabled ? "not-allowed" : "pointer",
              opacity: isSubmitDisabled ? 0.8 : 1,
            }}
          >
            {loading ? "Inscription..." : "S'inscrire"}
          </button>
          {/* Affichage conditionnel des feedbacks API. */}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          {success ? <p style={{ color: "#166534" }}>{success}</p> : null}
        </form>
      </section>
    </main>
  );
}
