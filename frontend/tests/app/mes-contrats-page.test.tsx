import { render, screen, waitFor } from "@testing-library/react";
import MesContratsPage from "@/app/mes-contrats/page";

const CONTRAT_ACTIF = {
  id: 1,
  reference: "DOS-2026-00001",
  vehicle_id: 10,
  vehicle: { make: "Renault", model: "Clio", year: 2024, mensualite: 299.99 },
  duree_mois: 36,
  date_debut: "2026-01-15",
  date_fin: "2029-01-15",
  is_active: true,
};

const CONTRAT_TERMINE = {
  id: 2,
  reference: "DOS-2024-00042",
  vehicle_id: 11,
  vehicle: { make: "Peugeot", model: "208", year: 2022, mensualite: 249.0 },
  duree_mois: 24,
  date_debut: "2022-03-01",
  date_fin: "2024-03-01",
  is_active: false,
};

describe("MesContratsPage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── Chargement ─────────────────────────────────────────────────────────────

  it("affiche le titre de la page", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText(/mes contrats lld/i)).toBeInTheDocument();
    });
  });

  it("appelle l'endpoint /api/v1/dossiers/contrats", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/dossiers/contrats"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  // ── Contrat actif ───────────────────────────────────────────────────────────

  it("affiche la référence du contrat avec un lien vers le dossier", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /dos-2026-00001/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/mes-dossiers/1");
    });
  });

  it("US-07-02 : lien « Adapter les options » vers la section options pour un contrat actif", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      const opt = screen.getByRole("link", { name: /adapter les options/i });
      expect(opt).toHaveAttribute("href", "/mes-dossiers/1#lld-options-section");
    });
  });

  it("affiche le véhicule (marque, modèle, année)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText(/renault clio/i)).toBeInTheDocument();
      expect(screen.getByText("(2024)")).toBeInTheDocument();
    });
  });

  it("affiche la durée du contrat en mois", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText("36 mois")).toBeInTheDocument();
    });
  });

  it("affiche la mensualité formatée en euros", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText(/299/)).toBeInTheDocument();
    });
  });

  it("affiche le badge 'Actif' pour un contrat en cours", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText("Actif")).toBeInTheDocument();
    });
  });

  it("le badge Actif a le bon aria-label", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      const badge = screen.getByRole("status", { name: /statut contrat : actif/i });
      expect(badge).toBeInTheDocument();
    });
  });

  // ── Contrat terminé ─────────────────────────────────────────────────────────

  it("affiche le badge 'Terminé' pour un contrat archivé", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_TERMINE],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText("Terminé")).toBeInTheDocument();
    });
  });

  it("affiche les deux contrats (actif et terminé) dans la liste", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [CONTRAT_ACTIF, CONTRAT_TERMINE],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00001")).toBeInTheDocument();
      expect(screen.getByText("DOS-2024-00042")).toBeInTheDocument();
      expect(screen.getByText("Actif")).toBeInTheDocument();
      expect(screen.getByText("Terminé")).toBeInTheDocument();
    });
  });

  // ── État vide ───────────────────────────────────────────────────────────────

  it("affiche un message quand aucun contrat n'existe", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/vous n'avez pas encore de contrat lld actif/i),
      ).toBeInTheDocument();
    });
  });

  it("affiche un lien vers le catalogue en état vide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /découvrir nos véhicules en lld/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/");
    });
  });

  // ── Erreur réseau ───────────────────────────────────────────────────────────

  it("affiche un message d'erreur en cas de réponse non-ok", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Authentification requise." }),
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain("Authentification requise.");
    });
  });

  it("affiche un message d'erreur en cas d'échec réseau", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  // ── Contrat sans date ni durée ──────────────────────────────────────────────

  it("affiche des tirets pour un contrat sans date ni durée définie", async () => {
    const contratSansDate = {
      ...CONTRAT_ACTIF,
      duree_mois: null,
      date_debut: null,
      date_fin: null,
    };

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [contratSansDate],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(screen.getByText("Actif")).toBeInTheDocument();
    });
  });

  // ── NEXT_PUBLIC_API_URL ─────────────────────────────────────────────────────

  it("préfixe l'URL avec NEXT_PUBLIC_API_URL si définie", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesContratsPage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/dossiers/contrats",
        expect.anything(),
      );
    });
  });
});
