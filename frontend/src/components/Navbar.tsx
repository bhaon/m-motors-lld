 "use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";

import AuthModal from "@/components/AuthModal";
import ProfileModal from "@/components/ProfileModal";

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
 * Retire un paramètre de la query sans `router.replace` : une navigation App Router
 * peut remonter la page et réinitialiser l'état client (ex. modale auth déjà ouverte).
 */
function stripUrlSearchParam(param: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(param)) return;
  url.searchParams.delete(param);
  const next = `${url.pathname}${url.search}${url.hash}` || "/";
  window.history.replaceState(window.history.state, "", next);
}

/** Clé sessionStorage : survit à une remontée client après strip de l’URL (Next / historique). */
const AUTH_DEEPLINK_RESUME_KEY = "m-motors-auth-deeplink-resume";

type AuthDeeplinkResume = "login" | "register" | "profile";

/**
 * Enregistre l’intention d’ouverture avant de retirer le paramètre d’URL, puis efface la clé
 * après un délai si aucune remontée n’a consommé la valeur (navigation « normale »).
 */
function persistDeeplinkForPossibleRemount(intent: AuthDeeplinkResume, paramToStrip: string): void {
  window.setTimeout(() => {
    try {
      sessionStorage.setItem(AUTH_DEEPLINK_RESUME_KEY, intent);
    } catch {
      /* navigation privée / quota */
    }
    stripUrlSearchParam(paramToStrip);
    window.setTimeout(() => {
      try {
        sessionStorage.removeItem(AUTH_DEEPLINK_RESUME_KEY);
      } catch {
        /* ignore */
      }
    }, 500);
  }, 0);
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
 * Icône voiture (SVG) pour le lien « Gestion véhicules » (gestionnaire+).
 */
function CarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

/**
 * Icône outils / services (SVG) pour le lien « Options LLD » (gestionnaire+).
 */
function ServicesToolsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M22.61 18.99l-9.08-9.06c.86-2.18.55-4.85-1.08-6.47-1.89-1.88-4.84-2.19-7.06-.86l3.56 3.56 2.83-2.83-3.56-3.56c-1.33 2.22-1.02 5.17.86 7.06 1.62 1.63 4.29 1.94 6.47 1.08l9.06 9.08c.39.39 1.02.39 1.41 0l2.83-2.83c.39-.39.39-1.03 0-1.42z"
      />
    </svg>
  );
}

/**
 * Icône liste (SVG) pour les entrées back-office type liste (ex. reporting).
 */
function ListIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
      />
    </svg>
  );
}

/**
 * Icône bouclier (SVG) pour le lien "Administration" (admin uniquement).
 */
function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5zm0 4l5 2.18V11c0 3.34-2.27 6.48-5 7.93C9.27 17.48 7 14.34 7 11V7.18z"
      />
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

function DossierIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M9 11h6v2H9zm0 4h6v2H9zm3-14H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 1.5L18.5 9H13zM6 20V4h5v7h7v9z"
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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [isNavOpen, setIsNavOpen] = useState(false);

  const isGestionnaire = role !== null && GESTIONNAIRE_ROLES.has(role);
  const isAdmin = role === "admin";
  const isSuperviseurReporting = role === "superviseur" || role === "admin";
  /** Liens espace client masqués uniquement pour le rôle gestionnaire (staff terrain). */
  const showClientPortfolioLinks = role !== "gestionnaire";

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
    if (typeof window === "undefined") return;
    function onSessionChanged() {
      void checkAuthStatus();
    }
    window.addEventListener("m-motors-auth-session-changed", onSessionChanged);
    return () => window.removeEventListener("m-motors-auth-session-changed", onSessionChanged);
  }, [checkAuthStatus]);

  /**
   * Ouvre les modales depuis l’URL (`/?connexion=1`, `/?inscription=1`, `/?profil=1`).
   * useLayoutEffect : ouverture avant premier paint (E2E / utilisateur). Après strip d’URL,
   * une remontée Next peut réinitialiser l’état : on relit sessionStorage au montage.
   */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    let resume: AuthDeeplinkResume | null = null;
    try {
      const raw = sessionStorage.getItem(AUTH_DEEPLINK_RESUME_KEY);
      if (raw === "login" || raw === "register" || raw === "profile") resume = raw;
    } catch {
      /* ignore */
    }
    if (resume) {
      try {
        sessionStorage.removeItem(AUTH_DEEPLINK_RESUME_KEY);
      } catch {
        /* ignore */
      }
      if (resume === "login") {
        setAuthModalTab("login");
        setAuthModalOpen(true);
      } else if (resume === "register") {
        setAuthModalTab("register");
        setAuthModalOpen(true);
      } else {
        setProfileModalOpen(true);
      }
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const c = params.get("connexion");
    const i = params.get("inscription");
    const p = params.get("profil");
    if (c === "1") {
      setAuthModalTab("login");
      setAuthModalOpen(true);
      persistDeeplinkForPossibleRemount("login", "connexion");
    } else if (i === "1") {
      setAuthModalTab("register");
      setAuthModalOpen(true);
      persistDeeplinkForPossibleRemount("register", "inscription");
    } else if (p === "1") {
      setProfileModalOpen(true);
      persistDeeplinkForPossibleRemount("profile", "profil");
    }
  }, []);

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
    <>
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authModalTab}
        onAuthenticated={checkAuthStatus}
      />
      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onProfileUpdated={checkAuthStatus}
      />
      {/* Barre principale persistante pour la navigation publique. */}
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

      {/* Hamburger — visible uniquement sur mobile via CSS */}
      <button
        type="button"
        className="nav-hamburger-btn"
        aria-label={isNavOpen ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setIsNavOpen((v) => !v)}
      >
        {isNavOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
          </svg>
        )}
      </button>

      {/* Liens de navigation principaux — cachés sur mobile via CSS (.nav-right) */}
      <div className="nav-right" style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
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
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={() => {
              setAuthModalTab("login");
              setAuthModalOpen(true);
            }}
            style={{
              color: "var(--white)",
              background: "transparent",
              border: 0,
              fontSize: ".85rem",
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
            }}
          >
            Connexion
          </button>
        ) : null}
        <Link
          href="/a-propos"
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
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setProfileModalOpen(true);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                    background: "#fff",
                    border: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                  }}
                >
                  <UserIcon />
                  Profile
                </button>

                {showClientPortfolioLinks ? (
                  <>
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
                  </>
                ) : null}

                {isGestionnaire && (
                  <>
                    <div style={{ height: 1, background: "rgba(15,23,42,.08)" }} />
                    <Link
                      href="/backoffice/vehicules"
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", textDecoration: "none", color: "#0e7490", fontWeight: 600 }}
                    >
                      <CarIcon />
                      Gestion véhicules
                    </Link>
                    <Link
                      href="/backoffice/options-lld"
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", textDecoration: "none", color: "#0e7490", fontWeight: 600 }}
                    >
                      <ServicesToolsIcon />
                      Options LLD
                    </Link>
                    <Link
                      href="/backoffice/dossiers"
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", textDecoration: "none", color: "#0e7490", fontWeight: 600 }}
                    >
                      <DossierIcon />
                      Dossiers en attente
                    </Link>
                    {isSuperviseurReporting ? (
                      <Link
                        href="/backoffice/reporting"
                        role="menuitem"
                        onClick={() => setIsMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "12px 14px",
                          textDecoration: "none",
                          color: "#6d28d9",
                          fontWeight: 600,
                        }}
                      >
                        <ListIcon />
                        Reporting dossiers
                      </Link>
                    ) : null}
                  </>
                )}

                {isAdmin && (
                  <>
                    <div style={{ height: 1, background: "rgba(15,23,42,.08)" }} />
                    <Link
                      href="/admin/utilisateurs"
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 14px",
                        textDecoration: "none",
                        color: "#b91c1c",
                        fontWeight: 600,
                      }}
                    >
                      <ShieldIcon />
                      Administration
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
      {/* ── Menu mobile (affiché sous la navbar quand hamburger ouvert) ── */}
      {isNavOpen && (
        <nav className="nav-mobile-panel" aria-label="Menu mobile">
          <Link href="/" onClick={() => setIsNavOpen(false)}>
            <CarIcon size={16} /> Catalogue
          </Link>
          <Link href="/a-propos" onClick={() => setIsNavOpen(false)}>
            <span style={{ fontSize: "1rem" }}>ℹ️</span> À propos
          </Link>

          {!isAuthenticated ? (
            <>
              <span className="mobile-section-label">Mon compte</span>
              <button
                type="button"
                onClick={() => {
                  setIsNavOpen(false);
                  setAuthModalTab("login");
                  setAuthModalOpen(true);
                }}
              >
                <UserIcon size={16} /> Connexion
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNavOpen(false);
                  setAuthModalTab("register");
                  setAuthModalOpen(true);
                }}
              >
                <UserIcon size={16} /> Inscription
              </button>
            </>
          ) : (
            <>
              <span className="mobile-section-label">Mon compte</span>
              <button
                type="button"
                onClick={() => {
                  setIsNavOpen(false);
                  setProfileModalOpen(true);
                }}
              >
                <UserIcon size={16} /> Profil
              </button>

              {showClientPortfolioLinks && (
                <>
                  <Link href="/mes-dossiers" onClick={() => setIsNavOpen(false)}>
                    <FolderIcon size={16} /> Mes dossiers
                  </Link>
                  <Link href="/mes-contrats" onClick={() => setIsNavOpen(false)}>
                    <ContractIcon size={16} /> Mes contrats
                  </Link>
                </>
              )}

              {isGestionnaire && (
                <>
                  <span className="mobile-section-label">Back-office</span>
                  <Link href="/backoffice/vehicules" onClick={() => setIsNavOpen(false)}>
                    <CarIcon size={16} /> Gestion véhicules
                  </Link>
                  <Link href="/backoffice/options-lld" onClick={() => setIsNavOpen(false)}>
                    <ServicesToolsIcon size={16} /> Options LLD
                  </Link>
                  <Link href="/backoffice/dossiers" onClick={() => setIsNavOpen(false)}>
                    <DossierIcon size={16} /> Dossiers en attente
                  </Link>
                  {isSuperviseurReporting && (
                    <Link href="/backoffice/reporting" onClick={() => setIsNavOpen(false)}>
                      <ListIcon size={16} /> Reporting
                    </Link>
                  )}
                </>
              )}

              {isAdmin && (
                <>
                  <span className="mobile-section-label">Administration</span>
                  <Link href="/admin/utilisateurs" onClick={() => setIsNavOpen(false)}>
                    <ShieldIcon size={16} /> Administration
                  </Link>
                </>
              )}

              <span className="mobile-section-label" />
              <button
                type="button"
                className="mobile-danger"
                onClick={() => {
                  setIsNavOpen(false);
                  void onLogout();
                }}
              >
                <LogoutIcon size={16} /> Déconnexion
              </button>
            </>
          )}
        </nav>
      )}
    </>
  );
}
