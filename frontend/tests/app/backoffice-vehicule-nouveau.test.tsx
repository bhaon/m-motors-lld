import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NouveauVehiculePage from "@/app/backoffice/vehicules/nouveau/page";

const SUCCESS_RESPONSE = {
  id: 42,
  reference: "VEH-00042",
  message: "Véhicule ajouté au catalogue avec succès.",
};

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/marque/i), { target: { value: "Renault" } });
  fireEvent.change(screen.getByLabelText(/modèle/i), { target: { value: "Clio" } });
  fireEvent.change(screen.getByLabelText(/année/i), { target: { value: "2024" } });
  fireEvent.change(screen.getByLabelText(/kilométrage/i), { target: { value: "8000" } });
  fireEvent.change(screen.getByLabelText(/prix de vente/i), { target: { value: "17990" } });
  fireEvent.change(screen.getByLabelText(/couleur/i), { target: { value: "Rouge" } });
  fireEvent.change(screen.getByLabelText(/puissance/i), { target: { value: "110 ch" } });
  fireEvent.change(screen.getByLabelText(/url photo principale/i), {
    target: { value: "https://example.com/photo.jpg" },
  });
}

describe("NouveauVehiculePage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── Rendu initial ───────────────────────────────────────────────────────────

  it("affiche le titre de la page", () => {
    render(<NouveauVehiculePage />);
    expect(screen.getByText(/ajouter un véhicule au catalogue/i)).toBeInTheDocument();
  });

  it("affiche tous les champs obligatoires", () => {
    render(<NouveauVehiculePage />);
    expect(screen.getByLabelText(/marque/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/modèle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/année/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/motorisation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kilométrage/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prix de vente/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/couleur/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/puissance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url photo principale/i)).toBeInTheDocument();
  });

  it("affiche le sélecteur de type de contrat (Achat / LLD)", () => {
    render(<NouveauVehiculePage />);
    expect(screen.getByDisplayValue("achat")).toBeInTheDocument();
    expect(screen.getByDisplayValue("lld")).toBeInTheDocument();
  });

  it("n'affiche pas le champ mensualité quand Achat est sélectionné", () => {
    render(<NouveauVehiculePage />);
    expect(screen.queryByLabelText(/mensualité/i)).not.toBeInTheDocument();
  });

  it("affiche le champ mensualité quand LLD est sélectionné", () => {
    render(<NouveauVehiculePage />);
    const lldRadio = screen.getByDisplayValue("lld");
    fireEvent.click(lldRadio);
    expect(screen.getByLabelText(/mensualité lld/i)).toBeInTheDocument();
  });

  it("affiche le bouton de soumission", () => {
    render(<NouveauVehiculePage />);
    expect(screen.getByRole("button", { name: /ajouter au catalogue/i })).toBeInTheDocument();
  });

  it("affiche le lien Annuler", () => {
    render(<NouveauVehiculePage />);
    const cancelLink = screen.getByRole("link", { name: /annuler/i });
    expect(cancelLink).toBeInTheDocument();
    expect(cancelLink).toHaveAttribute("href", "/");
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it("affiche les erreurs si le formulaire est soumis vide", async () => {
    render(<NouveauVehiculePage />);
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));
    await waitFor(() => {
      expect(screen.getByText(/la marque est obligatoire/i)).toBeInTheDocument();
      expect(screen.getByText(/le modèle est obligatoire/i)).toBeInTheDocument();
      expect(screen.getByText(/l'url de la photo principale est obligatoire/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si la mensualité est manquante pour LLD", async () => {
    render(<NouveauVehiculePage />);
    fireEvent.click(screen.getByDisplayValue("lld"));
    fillRequiredFields();
    // NE PAS renseigner la mensualité
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));
    await waitFor(() => {
      expect(screen.getByText(/mensualité lld ht est obligatoire/i)).toBeInTheDocument();
    });
  });

  it("n'envoie pas la requête si le formulaire est invalide", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    render(<NouveauVehiculePage />);
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));
    await waitFor(() => {
      expect(screen.getByText(/la marque est obligatoire/i)).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Soumission réussie ──────────────────────────────────────────────────────

  it("appelle POST /api/v1/vehicules/creer avec credentials: include", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    } as Response);

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/vehicules/creer"),
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
  });

  it("affiche le message de confirmation après création réussie", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    } as Response);

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(
        screen.getByText(/véhicule ajouté au catalogue avec succès/i),
      ).toBeInTheDocument();
    });
  });

  it("affiche la référence dans le message de confirmation", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    } as Response);

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(screen.getByText("VEH-00042")).toBeInTheDocument();
    });
  });

  it("remet le formulaire à zéro après une création réussie", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    } as Response);

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    // Les champs doivent être vides après reset
    expect((screen.getByLabelText(/marque/i) as HTMLInputElement).value).toBe("");
  });

  it("inclut le type LLD et la mensualité dans le payload", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    } as Response);

    render(<NouveauVehiculePage />);
    fireEvent.click(screen.getByDisplayValue("lld"));
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/mensualité lld/i), { target: { value: "299" } });
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.lld).toBe(true);
      expect(body.mensualite).toBe(299);
    });
  });

  // ── Erreur API ──────────────────────────────────────────────────────────────

  it("affiche un message d'erreur si l'API répond non-ok", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Accès non autorisé." }),
    } as Response);

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain("Accès non autorisé.");
    });
  });

  it("affiche un message d'erreur en cas d'échec réseau", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  // ── NEXT_PUBLIC_API_URL ─────────────────────────────────────────────────────

  it("préfixe l'URL avec NEXT_PUBLIC_API_URL si définie", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => SUCCESS_RESPONSE,
    } as Response);

    render(<NouveauVehiculePage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/vehicules/creer",
        expect.anything(),
      );
    });
  });
});
