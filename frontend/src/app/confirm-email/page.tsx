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

export default function ConfirmEmailPage() {
  // Message unique d'état (chargement, succès, erreur) pour un rendu simple.
  const [message, setMessage] = useState("Validation de votre email en cours...");
  // Permet de choisir la couleur du message selon le résultat.
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    // Le token est lu depuis l'URL de confirmation envoyée par email.
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setIsError(true);
      setMessage("Lien de confirmation invalide.");
      return;
    }
    // Copie locale pour éviter toute ambiguïté de fermeture dans l'effet.
    const confirmedToken = token;

    // Fonction dédiée à l'appel API pour conserver un useEffect lisible.
    async function confirmEmail() {
      try {
        // Appel backend de validation de token.
        const response = await fetch(resolveConfirmUrl(confirmedToken));
        // Lecture robuste du payload même si le backend renvoie du texte brut.
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(payload.detail || "Confirmation impossible.");
        }
        // Message de succès fourni par l'API si disponible.
        setMessage(payload.message || "Votre email est confirme.");
      } catch (e) {
        setIsError(true);
        // Fallback générique pour erreurs réseau/non standard.
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
