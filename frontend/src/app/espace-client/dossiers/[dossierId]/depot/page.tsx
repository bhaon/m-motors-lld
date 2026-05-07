import Navbar from "@/components/Navbar";

type DepotDossierPageProps = {
  params: Promise<{ dossierId: string }>;
  searchParams: Promise<{ type?: string; ref?: string }>;
};

/**
 * Normalise le type de dossier pour préremplir le formulaire.
 */
function normalizeDossierType(rawType: string | undefined): "achat" | "lld" {
  return rawType === "lld" ? "lld" : "achat";
}

export default async function DepotDossierPage({ params, searchParams }: Readonly<DepotDossierPageProps>) {
  const { dossierId } = await params;
  const query = await searchParams;
  const dossierType = normalizeDossierType(query.type);
  const reference = query.ref || `DOSSIER-${dossierId}`;

  return (
    <main>
      <Navbar />
      <section
        style={{
          maxWidth: 760,
          margin: "2rem auto",
          padding: "1.5rem",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: ".5rem" }}>
          Dépôt du dossier
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>
          Référence: <strong>{reference}</strong>
        </p>

        <form style={{ display: "grid", gap: ".9rem" }}>
          <label style={{ display: "grid", gap: ".35rem" }}>
            Type de dossier
            <select value={dossierType} readOnly aria-label="Type de dossier">
              <option value="achat">Achat</option>
              <option value="lld">LLD</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: ".35rem" }}>
            Commentaire client
            <textarea
              aria-label="Commentaire client"
              placeholder="Décrivez brièvement votre besoin (financement, délai, usage...)."
              rows={4}
            />
          </label>
          <button
            type="button"
            style={{
              background: "var(--navy)",
              color: "#fff",
              border: 0,
              padding: ".75rem",
              borderRadius: 8,
              width: "fit-content",
            }}
          >
            Enregistrer mon dossier
          </button>
        </form>
      </section>
    </main>
  );
}
