import Link from "next/link";

export default function Navbar() {
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
      </div>
    </nav>
  );
}
