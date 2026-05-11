import Link from "next/link";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "À propos — M-Motors",
  description:
    "Découvrez M-Motors : notre histoire, notre mission et nos engagements pour rendre l'accès au véhicule simple, transparent et 100 % dématérialisé.",
};

const PATTERN = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300B4D8' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

const VALUES = [
  {
    icon: "🔍",
    title: "Transparence",
    description:
      "Chaque véhicule est présenté avec son historique complet, son kilométrage réel et une grille tarifaire claire. Aucun frais caché.",
  },
  {
    icon: "📱",
    title: "100 % dématérialisé",
    description:
      "De la demande de financement à la signature du contrat, toutes les étapes se font en ligne — sans déplacement, sans paperasse.",
  },
  {
    icon: "🤝",
    title: "Accessibilité",
    description:
      "La location longue durée permet d'accéder à un véhicule récent avec des mensualités maîtrisées, quelle que soit votre situation.",
  },
  {
    icon: "⚡",
    title: "Réactivité",
    description:
      "Notre équipe de gestionnaires traite chaque dossier sous 48 heures ouvrées et vous tient informé à chaque étape par e-mail.",
  },
];

const STATS = [
  { value: "800+", label: "véhicules disponibles" },
  { value: "48 h", label: "délai moyen de traitement" },
  { value: "100 %", label: "dossiers en ligne" },
  { value: "0", label: "frais cachés" },
];

export default function APropos() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--off)" }}>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div
        style={{
          background:
            "linear-gradient(135deg,#0D1B4B 0%,#1a3070 60%,#0e4d6b 100%)",
          padding: "4rem 2rem 3rem",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{ position: "absolute", inset: 0, backgroundImage: PATTERN }}
          aria-hidden="true"
        />

        <p
          style={{
            fontFamily: "Syne, sans-serif",
            fontSize: ".8rem",
            fontWeight: 700,
            letterSpacing: ".15em",
            textTransform: "uppercase",
            color: "var(--cyan)",
            marginBottom: "1rem",
            position: "relative",
          }}
        >
          Qui sommes-nous
        </p>

        <h1
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(1.8rem, 5vw, 2.6rem)",
            color: "var(--white)",
            lineHeight: 1.15,
            marginBottom: "1.2rem",
            position: "relative",
          }}
        >
          L&apos;accès au véhicule,{" "}
          <span style={{ color: "var(--cyan)" }}>simplifié</span>
        </h1>

        <p
          style={{
            color: "rgba(255,255,255,.7)",
            fontSize: "1rem",
            maxWidth: "560px",
            margin: "0 auto",
            lineHeight: 1.7,
            position: "relative",
          }}
        >
          M-Motors est une plateforme de vente et de location longue durée de
          véhicules d&apos;occasion. Notre mission : rendre l&apos;acquisition
          automobile simple, transparente et entièrement dématérialisée.
        </p>
      </div>

      {/* ── Chiffres clés ─────────────────────────────────────── */}
      <div
        style={{
          background: "var(--white)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "2.5rem 2rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "1.5rem",
            textAlign: "center",
          }}
        >
          {STATS.map((s) => (
            <div key={s.label}>
              <strong
                style={{
                  display: "block",
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 800,
                  fontSize: "2rem",
                  color: "var(--navy)",
                }}
              >
                {s.value}
              </strong>
              <span style={{ fontSize: ".85rem", color: "var(--muted)" }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notre histoire ────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "4rem 2rem",
        }}
      >
        <h2
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: "1.6rem",
            color: "var(--navy)",
            marginBottom: "1.4rem",
          }}
        >
          Notre histoire
        </h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
            color: "#374151",
            lineHeight: 1.8,
            fontSize: ".95rem",
          }}
        >
          <p>
            M-Motors est née d&apos;un constat simple : acheter ou louer un
            véhicule d&apos;occasion reste trop souvent une démarche opaque,
            chronophage et semée de mauvaises surprises. Dossiers papier,
            allers-retours en agence, frais de dossier non annoncés…
          </p>
          <p>
            Nous avons voulu bâtir une alternative radicalement différente :
            une plateforme où chaque étape — du choix du véhicule à la
            signature du contrat — se déroule en ligne, avec une visibilité
            totale sur les conditions et un accompagnement humain disponible à
            chaque instant.
          </p>
          <p>
            Aujourd&apos;hui, M-Motors propose plus de 800 véhicules
            sélectionnés et traite chaque dossier de financement sous 48
            heures ouvrées, que vous optiez pour l&apos;achat direct ou la
            location longue durée (LLD) avec option d&apos;achat.
          </p>
        </div>
      </section>

      {/* ── Nos valeurs ───────────────────────────────────────── */}
      <section
        style={{
          background: "var(--white)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          padding: "4rem 2rem",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "Syne, sans-serif",
              fontWeight: 800,
              fontSize: "1.6rem",
              color: "var(--navy)",
              marginBottom: "2.5rem",
              textAlign: "center",
            }}
          >
            Nos engagements
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {VALUES.map((v) => (
              <div
                key={v.title}
                style={{
                  background: "var(--off)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  padding: "1.75rem 1.5rem",
                }}
              >
                <span
                  style={{ fontSize: "2rem", display: "block", marginBottom: ".8rem" }}
                  aria-hidden="true"
                >
                  {v.icon}
                </span>
                <h3
                  style={{
                    fontFamily: "Syne, sans-serif",
                    fontWeight: 700,
                    fontSize: "1rem",
                    color: "var(--navy)",
                    marginBottom: ".6rem",
                  }}
                >
                  {v.title}
                </h3>
                <p style={{ fontSize: ".88rem", color: "#4b5563", lineHeight: 1.65 }}>
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ─────────────────────────────────── */}
      <section style={{ maxWidth: 820, margin: "0 auto", padding: "4rem 2rem" }}>
        <h2
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: "1.6rem",
            color: "var(--navy)",
            marginBottom: "2rem",
          }}
        >
          Comment ça marche ?
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {[
            {
              step: "01",
              title: "Choisissez votre véhicule",
              desc: "Parcourez le catalogue, filtrez par type, prix ou kilométrage et sélectionnez le véhicule qui vous correspond.",
            },
            {
              step: "02",
              title: "Déposez votre dossier en ligne",
              desc: "Renseignez vos informations et téléversez vos pièces justificatives directement depuis votre espace client.",
            },
            {
              step: "03",
              title: "Notre équipe instruit votre dossier",
              desc: "Un gestionnaire traite votre demande sous 48 h ouvrées et vous notifie par e-mail à chaque changement de statut.",
            },
            {
              step: "04",
              title: "Signez et roulez",
              desc: "Après validation, signez votre contrat électroniquement et planifiez la livraison de votre véhicule.",
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                display: "flex",
                gap: "1.25rem",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--navy)",
                  color: "var(--cyan)",
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 800,
                  fontSize: ".85rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-hidden="true"
              >
                {item.step}
              </span>
              <div>
                <h3
                  style={{
                    fontFamily: "Syne, sans-serif",
                    fontWeight: 700,
                    fontSize: "1rem",
                    color: "var(--navy)",
                    marginBottom: ".35rem",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: ".9rem", color: "#4b5563", lineHeight: 1.65 }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section
        style={{
          background: "var(--navy)",
          padding: "3.5rem 2rem",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: "1.5rem",
            color: "var(--white)",
            marginBottom: ".8rem",
          }}
        >
          Prêt à trouver votre prochain véhicule ?
        </h2>
        <p style={{ color: "rgba(255,255,255,.65)", marginBottom: "1.8rem", fontSize: ".95rem" }}>
          Consultez notre catalogue et déposez votre dossier en quelques minutes.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            background: "var(--cyan)",
            color: "var(--navy)",
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: ".95rem",
            padding: ".85rem 2rem",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Voir le catalogue
        </Link>
      </section>
    </main>
  );
}
