import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BackofficeLldOptionsPage from "@/app/backoffice/options-lld/page";

const mockItems = [
  {
    code: "assurance",
    label: "Assurance tous risques",
    description: "Desc",
    enabled: true,
    surcout_mensuel_ht: 39,
    flag_updated_at: null,
  },
  {
    code: "assistance",
    label: "Assistance",
    description: "Desc",
    enabled: false,
    surcout_mensuel_ht: 9,
    flag_updated_at: null,
  },
];

/** Construit une réponse fetch minimaliste pour les séquences de tests. */
function jsonResponse(ok: boolean, body: unknown) {
  return Promise.resolve({
    ok,
    json: async () => body,
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: mockItems }),
  });
});

afterEach(() => jest.restoreAllMocks());

describe("BackofficeLldOptionsPage (US-07-03)", () => {
  it("affiche un tableau vide si le catalogue ne renvoie pas items", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(true, {}));
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.queryByText("assurance")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("charge le catalogue back-office", async () => {
    render(<BackofficeLldOptionsPage />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/backoffice/lld-catalog"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /Options LLD — catalogue/i })).toBeInTheDocument();
    expect(screen.getByText("Non")).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement catalogue échoue (réponse HTTP)", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      jsonResponse(false, { detail: "Accès refusé." }),
    );
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Accès refusé."));
  });

  it("affiche le message par défaut si le chargement échoue sans détail", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(false, {}));
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Chargement impossible."));
  });

  it("affiche une erreur réseau si fetch lève", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("boom"));
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
  });

  it("affiche une erreur générique si la cause n’est pas une Error", async () => {
    global.fetch = jest.fn().mockRejectedValueOnce("x");
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Erreur réseau."));
  });

  it("ouvre la modale d’historique", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(
        jsonResponse(true, {
          option_code: "assurance",
          history: [{ id: 1, price_ht: 39, valid_from: "2026-01-01T00:00:00Z", created_by_user_id: null }],
        }),
      );

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());

    const histButtons = screen.getAllByRole("button", { name: /^Historique$/i });
    fireEvent.click(histButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Historique — assurance/i })).toBeInTheDocument();
      expect(screen.getByText(/39\.00/)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si l’historique tarifaire est indisponible", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, { detail: "Indispo" }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Historique$/i })[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Indispo"));
  });

  it("ferme la modale historique via Fermer ou le fond", async () => {
    const histPayload = {
      option_code: "assurance",
      history: [{ id: 1, price_ht: 39, valid_from: "2026-01-01T00:00:00Z", created_by_user_id: null as number | null }],
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(true, histPayload))
      .mockResolvedValueOnce(jsonResponse(true, histPayload));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Historique$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Historique — assurance/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^Fermer$/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Historique — assurance/i })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^Historique$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Historique — assurance/i })).toBeInTheDocument());
    const histHeading = screen.getByRole("heading", { name: /Historique — assurance/i });
    const backdrop = histHeading.parentElement?.parentElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Historique — assurance/i })).not.toBeInTheDocument(),
    );
  });

  it("ouvre la modale texte, enregistre et recharge le catalogue", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(true, {}))
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /^Texte$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Modifier assurance/i })).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Assurance tous risques"), {
      target: { value: "Assurance MAJ" },
    });
    fireEvent.change(screen.getByDisplayValue("Desc"), { target: { value: "Desc MAJ" } });
    fireEvent.click(screen.getByRole("button", { name: /^Enregistrer$/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/api\/v1\/backoffice\/lld-catalog\/assurance$/),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("affiche une erreur si le PATCH texte est refusé", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, { detail: "Bad" }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Texte$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Modifier assurance/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Enregistrer$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Bad"));
  });

  it("affiche un message par défaut si le PATCH texte est refusé sans détail", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, {}));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Texte$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Modifier assurance/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Enregistrer$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Enregistrement refusé."));
  });

  it("ferme la modale texte via Annuler ou le fond", async () => {
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Texte$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Modifier assurance/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Annuler$/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Modifier assurance/i })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^Texte$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Modifier assurance/i })).toBeInTheDocument());
    const editHeading = screen.getByRole("heading", { name: /Modifier assurance/i });
    fireEvent.click(editHeading.closest("form")!.parentElement as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Modifier assurance/i })).not.toBeInTheDocument(),
    );
  });

  it("refuse un montant tarifaire invalide puis accepte une virgule décimale", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(true, {}))
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /^Tarif$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Nouveau tarif — assurance/i })).toBeInTheDocument());

    const priceInput = screen.getByDisplayValue("39");
    fireEvent.change(priceInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le tarif/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Montant HT invalide."));

    fireEvent.change(priceInput, { target: { value: "42,5" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le tarif/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const postCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(postCall[0]).toMatch(/\/price$/);
    expect(JSON.parse(postCall[1].body as string)).toEqual({ surcout_mensuel_ht: 42.5 });
  });

  it("affiche une erreur si le POST tarif est refusé", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, { detail: "Refus tarif" }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Tarif$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Nouveau tarif — assurance/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le tarif/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Refus tarif"));
  });

  it("affiche un message par défaut si le POST tarif est refusé sans détail", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, {}));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Tarif$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Nouveau tarif — assurance/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le tarif/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tarif refusé."));
  });

  it("ferme la modale tarif via Annuler ou le fond", async () => {
    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Tarif$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Nouveau tarif — assurance/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Annuler$/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Nouveau tarif — assurance/i })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^Tarif$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Nouveau tarif — assurance/i })).toBeInTheDocument());
    const priceHeading = screen.getByRole("heading", { name: /Nouveau tarif — assurance/i });
    fireEvent.click(priceHeading.closest("form")!.parentElement as HTMLElement);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /Nouveau tarif — assurance/i })).not.toBeInTheDocument(),
    );
  });

  it("met à jour l’activation et recharge en cas de succès", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(true, {}))
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());

    const cb = screen.getByRole("checkbox", { name: /Activer assurance/i });
    fireEvent.click(cb);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/activation$/),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: false }) }),
    );
  });

  it("affiche une erreur si l’activation est refusée", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, { detail: "Non" }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /Activer assurance/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Non"));
  });

  it("affiche un message par défaut si l’activation est refusée sans détail", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, {}));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /Activer assurance/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Mise à jour impossible."));
  });

  it("affiche un message par défaut si l’historique est indisponible sans détail", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(false, {}));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Historique$/i })[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Historique indisponible."));
  });

  it("affiche une liste vide si l’historique est OK sans entrées", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, { items: mockItems }))
      .mockResolvedValueOnce(jsonResponse(true, { option_code: "assurance", history: undefined }));

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /^Historique$/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Historique — assurance/i })).toBeInTheDocument());
    const panel = screen.getByRole("heading", { name: /Historique — assurance/i }).parentElement;
    expect(panel?.querySelectorAll("ul li")).toHaveLength(0);
  });
});
