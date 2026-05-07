import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CataloguePage from "@/components/CataloguePage";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("CataloguePage", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock;
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

  it("crée un dossier LLD puis redirige vers le formulaire", async () => {
    const v = SAMPLE_VEHICLES[0];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, reference: "DOS-2026-00042" }),
    });
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dossiers$/),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/espace-client/dossiers/42/depot?type=lld&ref=DOS-2026-00042",
      ),
    );
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
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Authentification requise." }),
    });
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));

    expect(await screen.findByText("Authentification requise.")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirige aussi pour un dossier achat (véhicule sans LLD)", async () => {
    const v = SAMPLE_VEHICLES.find((x) => !x.lld);
    expect(v).toBeDefined();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 77, reference: "DOS-2026-00077" }),
    });
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier Achat"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/espace-client/dossiers/77/depot?type=achat&ref=DOS-2026-00077",
      ),
    );
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
});
