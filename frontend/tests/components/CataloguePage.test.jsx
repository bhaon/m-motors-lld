import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CataloguePage from "@/components/CataloguePage";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

const CLIENT_ME = {
  id: 1,
  email: "client@test.fr",
  role: "client",
  first_name: "Cli",
  last_name: "Ent",
  phone: null,
  email_verified: true,
};

/**
 * Mock `fetch` aligné sur CataloguePage : session `/auth/me`, galerie, `lld-catalog`, POST `/dossiers`.
 */
function createCatalogueFetchMock(options = {}) {
  const {
    sessionAuthenticated = true,
    sessionBody = CLIENT_ME,
    dossierOk = true,
    dossierJson = { id: 42, reference: "DOS-2026-00042" },
    dossierErrorDetail = "Authentification requise.",
    lldCatalogJson = { items: [] },
    dossierReject = null,
  } = options;

  return (url, init) => {
    const u = typeof url === "string" ? url : String(url);
    const method = (init?.method || "GET").toUpperCase();

    if (u.includes("/api/v1/auth/me")) {
      if (!sessionAuthenticated) {
        return Promise.resolve({ ok: false, json: async () => ({ detail: "Session absente." }) });
      }
      return Promise.resolve({ ok: true, json: async () => sessionBody });
    }

    if (method === "POST" && /\/api\/v1\/dossiers\/?($|\?)/.test(u)) {
      if (dossierReject != null) {
        return Promise.reject(dossierReject);
      }
      return Promise.resolve({
        ok: dossierOk,
        json: async () => (dossierOk ? dossierJson : { detail: dossierErrorDetail }),
      });
    }

    if (u.includes("/lld-catalog")) {
      return Promise.resolve({ ok: true, json: async () => lldCatalogJson });
    }

    return Promise.resolve({ ok: true, json: async () => [] });
  };
}

/** Attend que la session ait été lue et que le bouton de confirmation soit utilisable. */
async function waitForConfirmDepositButton() {
  await waitFor(() => {
    const btn = screen.getByRole("button", { name: "Confirmer le dépôt" });
    expect(btn).toBeEnabled();
  });
}

describe("CataloguePage", () => {
  const fetchMock = jest.fn();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPush.mockClear();
    global.fetch = fetchMock;
    fetchMock.mockImplementation(createCatalogueFetchMock());
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("affiche le message catalogue vide (installation sans seed)", () => {
    render(<CataloguePage vehicles={[]} />);
    expect(screen.getByText("Catalogue vide")).toBeInTheDocument();
    expect(screen.getByText(/python scripts\/seed\.py/i)).toBeInTheDocument();
  });

  it("affiche les cartes et ouvre la fiche au clic", () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });

  it("ouvre une confirmation puis crée le dossier LLD après validation", async () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));

    expect(screen.getByText("Confirmer le dépôt du dossier")).toBeInTheDocument();
    await waitForConfirmDepositButton();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/dossiers"),
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dossiers$/),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/mes-dossiers?cree=1&ref=DOS-2026-00042&id=42&type=LLD",
      );
    });
  });

  it("met à jour les filtres via la barre de recherche", () => {
    render(<CataloguePage vehicles={SAMPLE_VEHICLES} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "Peugeot" },
    });
    expect(screen.getAllByText("Peugeot").length).toBeGreaterThan(0);
  });

  it("ferme la modale via le bouton Fermer", () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(
      screen.queryByRole("button", { name: "Fermer" }),
    ).not.toBeInTheDocument();
  });

  it("déclenche un message d'erreur si la création dossier échoue", async () => {
    const v = SAMPLE_VEHICLES[0];
    fetchMock.mockImplementation(
      createCatalogueFetchMock({ dossierOk: false, dossierErrorDetail: "Authentification requise." }),
    );
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    await waitForConfirmDepositButton();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    expect(await screen.findByText("Authentification requise.")).toBeInTheDocument();
  });

  it("annule le dépôt au clic sur le fond sans créer de dossier", () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    fireEvent.click(
      screen.getByRole("button", { name: "Annuler le dépôt (fond de modale)" }),
    );

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/dossiers"),
      expect.anything(),
    );
    expect(
      screen.queryByText("Confirmer le dépôt du dossier"),
    ).not.toBeInTheDocument();
  });

  it("crée aussi un dossier achat après confirmation", async () => {
    const v = SAMPLE_VEHICLES.find((x) => !x.lld);
    expect(v).toBeDefined();
    fetchMock.mockImplementation(
      createCatalogueFetchMock({ dossierJson: { id: 77, reference: "DOS-2026-00077" } }),
    );
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier Achat"));
    await waitForConfirmDepositButton();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/mes-dossiers?cree=1&ref=DOS-2026-00077&id=77&type=ACHAT",
      );
    });
  });

  it("après création LLD redirige vers Mes dossiers (pièces sur la fiche dossier)", async () => {
    const v = SAMPLE_VEHICLES[0];
    const lldCatalogJson = {
      items: [
        { code: "assurance", label: "Assurance tous risques", surcout_mensuel_ht: 39, enabled: true },
        { code: "assistance", label: "Assistance & dépannage", surcout_mensuel_ht: 9, enabled: true },
        { code: "entretien", label: "Entretien & révisions", surcout_mensuel_ht: 29, enabled: true },
        { code: "controle_technique", label: "Contrôle technique", surcout_mensuel_ht: 5, enabled: true },
      ],
    };
    fetchMock.mockImplementation(
      createCatalogueFetchMock({
        lldCatalogJson,
        dossierJson: { id: 55, reference: "DOS-2026-00055" },
      }),
    );

    render(<CataloguePage vehicles={[v]} />);
    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    await waitForConfirmDepositButton();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/mes-dossiers?cree=1&ref=DOS-2026-00055&id=55&type=LLD",
      );
    });
  });

  it("réinitialise les filtres depuis la ligne de chips", () => {
    render(<CataloguePage vehicles={SAMPLE_VEHICLES} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "Peugeot" },
    });
    fireEvent.click(screen.getByText("Réinitialiser les filtres"));
    expect(
      screen.getByText(`${SAMPLE_VEHICLES.length} véhicules`),
    ).toBeInTheDocument();
  });

  it("exécute le callback Rechercher de la barre de recherche", () => {
    render(<CataloguePage vehicles={SAMPLE_VEHICLES} />);
    fireEvent.click(screen.getByRole("button", { name: /Rechercher/i }));
  });

  it("utilise NEXT_PUBLIC_API_URL et les valeurs fallback de dossier", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    const v = SAMPLE_VEHICLES[0];
    fetchMock.mockImplementation(createCatalogueFetchMock({ dossierJson: {} }));
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    await waitForConfirmDepositButton();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/dossiers",
        expect.objectContaining({ method: "POST" }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        "/mes-dossiers?cree=1&ref=DOS-EN-ATTENTE&id=0&type=LLD",
      );
    });
  });

  it("affiche l'erreur technique si fetch échoue sans objet Error", async () => {
    const v = SAMPLE_VEHICLES[0];
    fetchMock.mockImplementation(createCatalogueFetchMock({ dossierReject: "network-down" }));
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    await waitForConfirmDepositButton();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    await waitFor(() => {
      expect(screen.getByText("Erreur technique lors du dépôt.")).toBeInTheDocument();
    });
  });

  it("sans session ouvre la connexion au lieu de poster le dossier", async () => {
    const v = SAMPLE_VEHICLES[0];
    fetchMock.mockImplementation(createCatalogueFetchMock({ sessionAuthenticated: false }));
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    await waitForConfirmDepositButton();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    expect(await screen.findByRole("heading", { name: /Accès à votre espace client/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dossiers$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
