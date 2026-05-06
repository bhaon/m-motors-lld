 "use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Résout l'URL d'authentification courante côté navigateur.
 */
function resolveMeUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/auth/me` : "/api/v1/auth/me";
}

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Vérifie si l'utilisateur est connecté afin d'afficher la pastille profil.
   */
  async function checkAuthStatus() {
    try {
      if (process.env.NODE_ENV === "test") return;
      if (typeof fetch !== "function") return;
      const response = await fetch(resolveMeUrl(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      setIsAuthenticated(response.ok);
    } catch {
      setIsAuthenticated(false);
    }
  }

  useEffect(() => {
    checkAuthStatus();
  }, []);

  return (
    // Barre principale persistante pour la navigation publique.
    <nav
      style={{
        background: "var(--navy)",
        padding: "0 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "60px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 12px rgba(0,0,0,.25)",
      }}
    >
      {/* Signature visuelle de marque. */}
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          fontWeight: 800,
          fontSize: "1.3rem",
          color: "var(--white)",
          letterSpacing: ".04em",
        }}
      >
        M-<span style={{ color: "var(--cyan)" }}>MOTORS</span>
      </div>

      {/* Liens de navigation principaux du parcours utilisateur. */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
        <Link
          href="/"
          style={{
            color: "var(--white)",
            textDecoration: "none",
            fontSize: ".85rem",
            fontWeight: 500,
          }}
        >
          Catalogue
        </Link>
        {/* Point d'entrée principal du tunnel d'inscription. */}
        <Link
          href="/inscription"
          style={{
            color: "var(--white)",
            textDecoration: "none",
            fontSize: ".85rem",
            fontWeight: 500,
          }}
        >
          Inscription
        </Link>
        <Link
          href="/connexion"
          style={{
            color: "var(--white)",
            textDecoration: "none",
            fontSize: ".85rem",
            fontWeight: 500,
          }}
        >
          Connexion
        </Link>
        {/* Lien placeholder en attendant une page "À propos" dédiée. */}
        <Link
          href="#"
          style={{
            color: "rgba(255,255,255,.7)",
            textDecoration: "none",
            fontSize: ".85rem",
            fontWeight: 500,
          }}
        >
          À propos
        </Link>
        {isAuthenticated ? (
          <Link
            href="/espace-client"
            aria-label="Accéder à mon espace client"
            title="Espace client"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "9999px",
              background: "var(--cyan)",
              color: "var(--navy)",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              fontSize: ".8rem",
            }}
          >
            U
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
