import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BackofficeDossiersPage from "@/app/backoffice/dossiers/page";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    reference: "DOS-2026-00001",
    type: "achat",
    status: "depose",
    submitted_at: "2026-03-15T10:00:00Z",
    created_at: "2026-03-14T08:00:00Z",
    pieces_count: 3,
    vehicle: { make: "Renault", model: "Clio", year: 2022 },
    client: { id: 10, email: "jean.dupont@example.com", first_name: "Jean", last_name: "Dupont" },
    ...overrides,
  };
}

function makeList(items = [makeItem()], total?: number) {
  return { total: total ?? items.length, page: 1, page_size: 20, items };
}

function mockFetch(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => response,
  });
}

beforeEach(() => {
  mockFetch(makeList());
});
afterEach(() => jest.restoreAllMocks());

// ── Rendu initial ─────────────────────────────────────────────────────────────

describe("BackofficeDossiersPage — rendu initial", () => {
  it("affiche le titre de la page", async () => {
    render(<BackofficeDossiersPage />);
    expect(screen.getByText("Dossiers en attente")).toBeInTheDocument();
  });

  it("affiche le panneau de filtres", async () => {
    render(<BackofficeDossiersPage />);
    expect(screen.getByLabelText(/filtres/i)).toBeInTheDocument();
  });

  it("affiche les boutons de statut", () => {
    render(<BackofficeDossiersPage />);
    expect(screen.getByRole("button", { name: /déposé/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /en instruction/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /validé/i })).toBeInTheDocument();
  });

  it("les statuts Déposé et En instruction sont actifs par défaut", () => {
    render(<BackofficeDossiersPage />);
    expect(screen.getByRole("button", { name: /déposé/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /en instruction/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /validé/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("appelle l'API avec les statuts par défaut au montage", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("statuts=depose"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("statuts=en_instruction"),
      expect.anything(),
    );
  });

  it("appelle l'API avec le tri par défaut (submitted_asc)", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("sort=submitted_asc"),
        expect.anything(),
      );
    });
  });
});

// ── Affichage des données ──────────────────────────────────────────────────────

describe("BackofficeDossiersPage — affichage des données", () => {
  it("affiche le tableau après chargement", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText("DOS-2026-00001")).toBeInTheDocument());
  });

  it("affiche les informations client", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText("Jean Dupont")).toBeInTheDocument());
    expect(screen.getByText("jean.dupont@example.com")).toBeInTheDocument();
  });

  it("affiche les informations véhicule", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText(/renault clio/i)).toBeInTheDocument());
  });

  it("affiche le nombre de pièces", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText("3/5")).toBeInTheDocument());
  });

  it("affiche le badge de type LLD", async () => {
    mockFetch(makeList([makeItem({ type: "lld" })]));
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText("LLD")).toBeInTheDocument());
  });

  it("affiche le compteur total", async () => {
    mockFetch(makeList([makeItem()], 42));
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText(/42 dossiers trouvés/i)).toBeInTheDocument());
  });

  it("affiche un message vide quand aucun dossier", async () => {
    mockFetch(makeList([], 0));
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText(/aucun dossier trouvé/i)).toBeInTheDocument());
  });
});

// ── Erreur API ────────────────────────────────────────────────────────────────

describe("BackofficeDossiersPage — erreur API", () => {
  it("affiche un message d'erreur si l'API répond non-ok", async () => {
    mockFetch({ detail: "Accès refusé." }, false);
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain("Accès refusé.");
  });

  it("affiche un message d'erreur en cas d'échec réseau", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

// ── Filtres ───────────────────────────────────────────────────────────────────

describe("BackofficeDossiersPage — filtres", () => {
  it("toggle le statut Validé et appelle Appliquer", async () => {
    render(<BackofficeDossiersPage />);

    fireEvent.click(screen.getByRole("button", { name: /validé/i }));
    expect(screen.getByRole("button", { name: /validé/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /appliquer/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("statuts=valide"),
        expect.anything(),
      );
    });
  });

  it("filtre par type LLD", async () => {
    render(<BackofficeDossiersPage />);

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "lld" } });
    fireEvent.click(screen.getByRole("button", { name: /appliquer/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("type_contrat=lld"),
        expect.anything(),
      );
    });
  });

  it("filtre par date de dépôt", async () => {
    render(<BackofficeDossiersPage />);

    fireEvent.change(screen.getByLabelText(/déposé depuis/i), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /appliquer/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("date_from=2026-01-01"),
        expect.anything(),
      );
    });
  });

  it("réinitialise les filtres aux valeurs par défaut", async () => {
    render(<BackofficeDossiersPage />);

    // Active un filtre
    fireEvent.click(screen.getByRole("button", { name: /validé/i }));
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser/i }));

    expect(screen.getByRole("button", { name: /déposé/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /validé/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("change le tri", async () => {
    render(<BackofficeDossiersPage />);

    fireEvent.change(screen.getByLabelText(/tri/i), { target: { value: "submitted_desc" } });
    fireEvent.click(screen.getByRole("button", { name: /appliquer/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("sort=submitted_desc"),
        expect.anything(),
      );
    });
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe("BackofficeDossiersPage — pagination", () => {
  it("n'affiche pas la pagination si une seule page", async () => {
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText("DOS-2026-00001")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /suivant/i })).not.toBeInTheDocument();
  });

  it("affiche les boutons de pagination si plusieurs pages", async () => {
    mockFetch({ total: 45, page: 1, page_size: 20, items: [makeItem()] });
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /suivant/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /précédent/i })).toBeDisabled();
  });

  it("clique sur Suivant envoie page=2", async () => {
    mockFetch({ total: 45, page: 1, page_size: 20, items: [makeItem()] });
    render(<BackofficeDossiersPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /suivant/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /suivant/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything(),
      );
    });
  });
});

// ── US-06-02 — Prise en charge ────────────────────────────────────────────────

describe("BackofficeDossiersPage — prise en charge (US-06-02)", () => {
  it("affiche le bouton 'Prendre en charge' pour un dossier 'depose'", async () => {
    mockFetch(makeList([makeItem({ status: "depose" })]));
    render(<BackofficeDossiersPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /prendre en charge le dossier dos-2026-00001/i }),
      ).toBeInTheDocument(),
    );
  });

  it("n'affiche pas le bouton pour un dossier 'en_instruction'", async () => {
    mockFetch(makeList([makeItem({ status: "en_instruction" })]));
    render(<BackofficeDossiersPage />);
    await waitFor(() => expect(screen.getByText("DOS-2026-00001")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /prendre en charge/i })).not.toBeInTheDocument();
  });

  it("appelle PATCH /dossiers/{id}/prendre-en-charge au clic", async () => {
    const patchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, reference: "DOS-2026-00001", status: "en_instruction", gestionnaire_id: 5 }),
    });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeList([makeItem()]) })
      .mockImplementation(patchMock);

    render(<BackofficeDossiersPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /prendre en charge le dossier dos-2026-00001/i }),
    );

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/dossiers/1/prendre-en-charge"),
        expect.objectContaining({ method: "PATCH", credentials: "include" }),
      ),
    );
  });

  it("met à jour le statut dans la liste après prise en charge", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeList([makeItem({ status: "depose" })]) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, reference: "DOS-2026-00001", status: "en_instruction", gestionnaire_id: 5 }),
      });

    render(<BackofficeDossiersPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /prendre en charge le dossier dos-2026-00001/i }),
    );

    await waitFor(() => expect(screen.getByText("En instruction")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /prendre en charge/i })).not.toBeInTheDocument();
  });

  it("affiche un toast de confirmation après prise en charge", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeList([makeItem()]) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, reference: "DOS-2026-00001", status: "en_instruction", gestionnaire_id: 5 }),
      });

    render(<BackofficeDossiersPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /prendre en charge le dossier dos-2026-00001/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/dos-2026-00001 pris en charge/i),
    );
  });

  it("affiche une erreur si la prise en charge échoue (409)", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeList([makeItem()]) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Impossible de prendre en charge un dossier au statut 'brouillon'." }),
      });

    render(<BackofficeDossiersPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /prendre en charge le dossier dos-2026-00001/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/impossible de prendre en charge/i),
    );
  });
});
