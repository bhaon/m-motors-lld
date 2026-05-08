 "use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Résout l'URL d'authentification courante côté navigateur.
 */
function resolveMeUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/auth/me` : "/api/v1/auth/me";
}

/**
 * Résout l'URL backend de déconnexion.
 */
function resolveLogoutUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/auth/logout` : "/api/v1/auth/logout";
}

/**
 * Icône utilisateur (SVG) pour les éléments de menu.
 */
function UserIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4m0 2c-4.42 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.58-4.5-8-4.5"
      />
    </svg>
  );
}

/**
 * Icône déconnexion (SVG) pour les éléments de menu.
 */
function LogoutIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2h-2v2H6V5h6v2zm3.59 4l-2.3-2.29L16.7 7.3L21.41 12l-4.71 4.7l-1.41-1.41L17.59 13H10v-2z"
      />
    </svg>
  );
}

/**
 * Icône dossier (SVG) pour les éléments de menu.
 */
function FolderIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10 4l2 2h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zm0 2H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8H11.17z"
      />
    </svg>
  );
}

/**
 * Icône + (SVG) pour le lien "Ajouter un véhicule" (gestionnaire+).
 */
function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
    </svg>
  );
}

/**
 * Icône contrat (SVG) pour les éléments de menu.
 */
function ContractIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 1.5L18.5 9H13zM6 20V4h5v7h7v9zm2-5h8v2H8zm0-3h5v2H8z"
      />
    </svg>
  );
}

const GESTIONNAIRE_ROLES = new Set(["gestionnaire", "superviseur", "admin"]);

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initials, setInitials] = useState<string>("U");
  const [role, setRole] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isGestionnaire = role !== null && GESTIONNAIRE_ROLES.has(role);

  /**
   * Vérifie si l'utilisateur est connecté afin d'afficher la pastille profil.
   */
  const checkAuthStatus = useCallback(async () => {
    try {
      if (process.env.NODE_ENV === "test") return;
      if (typeof fetch !== "function") return;
      const response = await fetch(resolveMeUrl(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setIsAuthenticated(false);
        setInitials("U");
        setRole(null);
        return;
      }
      setIsAuthenticated(true);
      try {
        const me = (await response.json()) as {
          first_name?: string;
          last_name?: string;
          role?: string;
        };
        const a = (me.first_name || "").trim()[0] || "";
        const b = (me.last_name || "").trim()[0] || "";
        setInitials(`${a}${b}`.toUpperCase() || "U");
        setRole(me.role ?? null);
      } catch {
        // En tests / réponses non JSON, on conserve le fallback.
        setInitials("U");
        setRole(null);
      }
    } catch {
      setIsAuthenticated(false);
      setInitials("U");
      setRole(null);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    /**
     * Ferme le menu si clic en dehors de la zone dropdown.
     */
    function onDocumentMouseDown(event: MouseEvent) {
      const root = menuRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    /**
     * Ferme le menu à l'appui sur Escape.
     */
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    if (!isMenuOpen) return;
    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [isMenuOpen]);

  /**
   * Déconnecte l'utilisateur (suppression cookie) puis rafraîchit l'UI.
   */
  async function onLogout() {
    try {
      await fetch(resolveLogoutUrl(), { method: "POST", credentials: "include" });
    } finally {
      setIsMenuOpen(false);
      setIsAuthenticated(false);
      setInitials("U");
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    }
  }

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
        {/* Point d'entrée principal du tunnel d'inscription (visible hors session). */}
        {!isAuthenticated ? (
          <>
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
          </>
        ) : null}
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
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Ouvrir le menu utilisateur"
              title="Menu utilisateur"
              onClick={() => setIsMenuOpen((v) => !v)}
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
                border: 0,
                cursor: "pointer",
                fontSize: ".8rem",
              }}
            >
              {initials}
            </button>

            {isMenuOpen ? (
              <div
                role="menu"
                aria-label="Menu utilisateur"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 10px)",
                  minWidth: 220,
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,.12)",
                  boxShadow: "0 10px 30px rgba(0,0,0,.22)",
                  overflow: "hidden",
                }}
              >
                <Link
                  href="/espace-client"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  <UserIcon />
                  Profile
                </Link>

                <div style={{ height: 1, background: "rgba(15,23,42,.08)" }} />

                <Link
                  href="/mes-dossiers"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  <FolderIcon />
                  Mes dossiers
                </Link>

                <div style={{ height: 1, background: "rgba(15,23,42,.08)" }} />

                <Link
                  href="/mes-contrats"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  <ContractIcon />
                  Mes contrats
                </Link>

                {isGestionnaire && (
                  <>
                    <div style={{ height: 1, background: "rgba(15,23,42,.08)" }} />
                    <Link
                      href="/backoffice/vehicules/nouveau"
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 14px",
                        textDecoration: "none",
                        color: "#0e7490",
                        fontWeight: 600,
                      }}
                    >
                      <PlusIcon />
                      Ajouter un véhicule
                    </Link>
                  </>
                )}

                <div style={{ height: 1, background: "rgba(15,23,42,.08)" }} />

                <button
                  type="button"
                  role="menuitem"
                  onClick={onLogout}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    background: "#fff",
                    border: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "#b91c1c",
                    fontWeight: 700,
                  }}
                >
                  <LogoutIcon />
                  Déconnexion
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
