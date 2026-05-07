import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CataloguePage from "@/components/CataloguePage";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

jest.mock("@/lib/checksum", () => ({
  computeFileSha256Hex: jest.fn(async () => "a".repeat(64)),
  sha256HexToBase64: jest.fn(() => "checksum-base64"),
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

  it("ouvre une confirmation puis crée le dossier LLD après validation", async () => {
    const v = SAMPLE_VEHICLES[0];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, reference: "DOS-2026-00042" }),
    });
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));

    expect(screen.getByText("Confirmer le dépôt du dossier")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dossiers$/),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Dossier LLD créé (DOS-2026-00042)"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Dépôt des pièces justificatives"),
    ).toBeInTheDocument();
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

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Confirmer le dépôt du dossier"),
    ).not.toBeInTheDocument();
  });

  it("crée aussi un dossier achat après confirmation", async () => {
    const v = SAMPLE_VEHICLES.find((x) => !x.lld);
    expect(v).toBeDefined();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 77, reference: "DOS-2026-00077" }),
    });
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier Achat"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    await waitFor(() =>
      expect(
        screen.getByText("Dossier ACHAT créé (DOS-2026-00077)"),
      ).toBeInTheDocument(),
    );
  });

  it("uploade une pièce et affiche le checkmark vert", async () => {
    const v = SAMPLE_VEHICLES[0];
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 55, reference: "DOS-2026-00055" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://minio.local/upload",
          s3_key: "dossiers/55/cni/file.pdf",
          headers: {
            "Content-Type": "application/pdf",
            "x-amz-checksum-sha256": "checksum-base64",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Pièce uploadée et validée" }),
      });

    render(<CataloguePage vehicles={[v]} />);
    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));

    await screen.findByText("Dépôt des pièces justificatives");
    const fileInput = screen.getByLabelText("CNI");
    const file = new File(["dummy-pdf"], "cni.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText("✓ Uploadé")).toBeInTheDocument(),
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
