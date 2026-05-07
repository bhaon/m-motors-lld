import { render, screen, waitFor } from "@testing-library/react";
import MesDossiersPage from "@/app/mes-dossiers/page";

describe("MesDossiersPage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("affiche les dossiers chargés depuis l'API", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          reference: "DOS-2026-00042",
          type: "lld",
          status: "brouillon",
          created_at: "2026-05-07T10:15:00Z",
        },
      ],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00042")).toBeInTheDocument();
      expect(screen.getByText("brouillon")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "DOS-2026-00042" })).toHaveAttribute("href", "/mes-dossiers/1");
    });
  });

  it("affiche un message vide quand aucun dossier n'est retourné", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText(/aucun dossier trouvé/i)).toBeInTheDocument();
    });
  });

  it("affiche le message d'erreur backend en cas d'échec API", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Authentification requise." }),
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("Authentification requise.")).toBeInTheDocument();
    });
  });

  it("utilise NEXT_PUBLIC_API_URL quand défini", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/dossiers/me",
        expect.objectContaining({ method: "GET", credentials: "include" }),
      );
    });
  });

  it("affiche une erreur technique quand l'appel échoue sans objet Error", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue("network-down");
    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("Erreur technique.")).toBeInTheDocument();
    });
  });
});
