interface HeroProps {
  vehicleCount: number;
}

export default function Hero({ vehicleCount }: Readonly<HeroProps>) {
  const PATTERN = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300B4D8' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg,#0D1B4B 0%,#1a3070 60%,#0e4d6b 100%)",
        padding: "3.5rem 2rem 2.5rem",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Pattern overlay */}
      <div
        style={{ position: "absolute", inset: 0, backgroundImage: PATTERN }}
      />

      <h1
        style={{
          fontFamily: "Syne, sans-serif",
          fontWeight: 800,
          fontSize: "2.4rem",
          color: "var(--white)",
          marginBottom: ".6rem",
          position: "relative",
        }}
      >
        Trouvez votre véhicule
        <br />
        <span style={{ color: "var(--cyan)" }}>à l&apos;achat ou en LLD</span>
      </h1>

      <p
        style={{
          color: "rgba(255,255,255,.65)",
          fontSize: ".95rem",
          position: "relative",
          maxWidth: "480px",
          margin: "0 auto 1.5rem",
        }}
      >
        Plus de 800 véhicules d&apos;occasion sélectionnés — Location longue
        durée avec option d&apos;achat disponible
      </p>

      <div
        style={{
          display: "flex",
          gap: "2rem",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <HeroStat value={vehicleCount} label="véhicules" />
        <HeroStat value="LLD" label="dès 199€/mois" />
        <HeroStat value="100%" label="dématérialisé" />
      </div>
    </div>
  );
}

interface HeroStatProps {
  value: string | number;
  label: string;
}

/** Bloc chiffre clé sous le titre du hero. */
function HeroStat({ value, label }: Readonly<HeroStatProps>) {
  return (
    <div style={{ textAlign: "center" }}>
      <strong
        style={{
          display: "block",
          fontFamily: "Syne, sans-serif",
          fontWeight: 700,
          fontSize: "1.5rem",
          color: "var(--gold)",
        }}
      >
        {value}
      </strong>
      <span
        style={{
          fontSize: ".78rem",
          color: "rgba(255,255,255,.55)",
          textTransform: "uppercase",
          letterSpacing: ".06em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
