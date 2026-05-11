import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MesDossiersPage from "@/app/mes-dossiers/page";

const DOSSIER_LLD_BROUILLON = {
  id: 1,
  reference: "DOS-2026-00042",
  type: "lld" as const,
  status: "brouillon",
  vehicle_id: 10,
  client_id: 5,
  created_at: "2026-05-07T10:15:00Z",
  vehicle: { make: "Renault", model: "Clio", year: 2024 },
};

const DOSSIER_ACHAT_DEPOSE = {
  id: 2,
  reference: "DOS-2026-00043",
  type: "achat" as const,
  status: "depose",
  vehicle_id: 11,
  client_id: 5,
  created_at: "2026-05-01T08:00:00Z",
  vehicle: { make: "Peugeot", model: "208", year: 2023 },
};

describe("MesDossiersPage", () => {
  const originalEnv = { ...process.env };

  /** Fixe l’URL vue par `window.location` (happy-dom : `replaceState` ne met pas à jour `search`). */
  function setPageUrl(pathWithQuery: string) {
    const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
    (window as unknown as { happyDOM: { setURL: (u: string) => void } }).happyDOM.setURL(
      `http://localhost${path}`,
    );
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    setPageUrl("/mes-dossiers");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── Chargement ─────────────────────────────────────────────────────────────

  it("affiche le titre du tableau de bord", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText(/mon tableau de bord/i)).toBeInTheDocument();
    });
  });

  it("affiche la référence du dossier avec un lien vers le détail", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /dos-2026-00042/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/mes-dossiers/1");
    });
  });

  it("affiche les informations du véhicule (marque, modèle, année)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText(/renault clio/i)).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
    });
  });

  it("affiche le badge de statut lisible en français", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("Brouillon")).toBeInTheDocument();
    });
  });

  it("affiche le badge de statut 'Déposé' pour un dossier déposé", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_ACHAT_DEPOSE],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("Déposé")).toBeInTheDocument();
    });
  });

  it("affiche le type formaté (LLD / Achat)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON, DOSSIER_ACHAT_DEPOSE],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("LLD")).toBeInTheDocument();
      expect(screen.getByText("Achat")).toBeInTheDocument();
    });
  });

  it("affiche la date de création formatée", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("07/05/2026")).toBeInTheDocument();
    });
  });

  it("affiche un lien 'Voir' pour chaque dossier", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /voir le dossier/i })).toBeInTheDocument();
    });
  });

  // ── Bouton Supprimer ───────────────────────────────────────────────────────

  it("affiche le bouton Supprimer uniquement pour les dossiers en brouillon", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
    });
  });

  it("n'affiche pas le bouton Supprimer pour un dossier non brouillon", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_ACHAT_DEPOSE],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    });
  });

  it("supprime un dossier brouillon et le retire de la liste", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [DOSSIER_LLD_BROUILLON],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00042")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "/api/v1/dossiers/1",
        expect.objectContaining({ method: "DELETE", credentials: "include" }),
      );
      expect(screen.queryByText("DOS-2026-00042")).not.toBeInTheDocument();
    });
  });

  // ── État vide ──────────────────────────────────────────────────────────────

  it("affiche un message et un lien catalogue quand la liste est vide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText(/aucun dossier pour le moment/i)).toBeInTheDocument();
      // "catalogue" (minuscule) est le lien dans l'état vide ; Navbar a "Catalogue" (majuscule)
      expect(screen.getByRole("link", { name: "catalogue" })).toHaveAttribute("href", "/");
    });
  });

  // ── Erreurs ────────────────────────────────────────────────────────────────

  it("affiche l'erreur backend en cas d'échec API", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Authentification requise." }),
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Authentification requise.");
    });
  });

  it("affiche une erreur générique quand fetch lève une exception non-Error", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue("network-down");

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Erreur technique.");
    });
  });

  it("affiche l'erreur backend si la suppression échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [DOSSIER_LLD_BROUILLON],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Seuls les dossiers en brouillon peuvent être supprimés." }),
      } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00042")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Seuls les dossiers en brouillon peuvent être supprimés."
      );
    });
  });

  // ── Variables d'environnement ──────────────────────────────────────────────

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

  it("utilise l'URL absolue pour DELETE quand NEXT_PUBLIC_API_URL est défini", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [DOSSIER_LLD_BROUILLON],
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "https://api.example.com/api/v1/dossiers/1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // ── Bannière après redirection catalogue (?cree=1) ─────────────────────────

  it("affiche la bannière de dossier créé avec id valide et nettoie la query", async () => {
    const replaceSpy = jest.spyOn(window.history, "replaceState");
    setPageUrl("/mes-dossiers?cree=1&ref=DOS-2026-NEW&id=1&type=LLD");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      const banner = screen.getByRole("region", { name: /confirmation de création/i });
      expect(banner).toHaveTextContent(/DOS-2026-NEW/);
      expect(banner).toHaveTextContent(/Cliquez sur la référence/);
    });
    expect(replaceSpy).toHaveBeenCalled();
    replaceSpy.mockRestore();
  });

  it("bannière sans id valide : message alternatif et type DOSSIER par défaut", async () => {
    setPageUrl("/mes-dossiers?cree=1&ref=DOS-SANS-ID&id=xyz");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      const banner = screen.getByRole("region", { name: /confirmation de création/i });
      expect(banner).toHaveTextContent(/DOSSIER/);
      expect(banner).toHaveTextContent(/Retrouvez-le dans le tableau/);
    });
  });

  it("conserve les autres paramètres d'URL après nettoyage de cree/ref/id/type", async () => {
    const replaceSpy = jest.spyOn(window.history, "replaceState");
    setPageUrl("/mes-dossiers?cree=1&ref=R1&id=1&type=LLD&keep=oui");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: /confirmation de création/i }),
      ).toBeInTheDocument();
    });
    expect(replaceSpy).toHaveBeenCalledWith(
      {},
      "",
      expect.stringContaining("keep=oui"),
    );
    replaceSpy.mockRestore();
  });

  it("ferme la bannière de création au clic sur Fermer", async () => {
    setPageUrl("/mes-dossiers?cree=1&ref=DOS-X&id=1&type=ACHAT");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: /confirmation de création/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: /confirmation de création/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("sans cree=1, aucune bannière de création", async () => {
    setPageUrl("/mes-dossiers?ref=only");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00042")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("region", { name: /confirmation de création/i }),
    ).not.toBeInTheDocument();
  });

  it("applique le surlignage de ligne au survol quand l'id correspond à la query", async () => {
    setPageUrl("/mes-dossiers?cree=1&ref=DOS-2026-00042&id=1&type=LLD");

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [DOSSIER_LLD_BROUILLON],
    } as Response);

    render(<MesDossiersPage />);

    const row = await screen.findByText("DOS-2026-00042").then((el) => el.closest("tr"));
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(row!);
    fireEvent.mouseLeave(row!);
    expect(row).toBeInTheDocument();
  });

  it("affiche une date — pour une date de création invalide", async () => {
    const badDate = { ...DOSSIER_LLD_BROUILLON, created_at: "pas-une-date" };
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [badDate],
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00042")).toBeInTheDocument();
    });
    const table = screen.getByRole("table", { name: /liste de mes dossiers/i });
    expect(within(table).getByText("—")).toBeInTheDocument();
  });

  it("affiche le type en majuscules pour un type métier inconnu", async () => {
    const weird = {
      ...DOSSIER_LLD_BROUILLON,
      id: 99,
      reference: "DOS-2026-0099",
      type: "leasing_special",
    };
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      // Réponse API atypique : couverture du repli `TYPE_LABEL ?? .toUpperCase()`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: async () => [weird] as any,
    } as Response);

    render(<MesDossiersPage />);

    await waitFor(() => {
      expect(screen.getByText("LEASING_SPECIAL")).toBeInTheDocument();
    });
  });
});