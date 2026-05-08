import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GestionVehiculesPage from "@/app/backoffice/vehicules/page";

const VEHICLE_LLD = {
  id: 1,
  make: "Peugeot",
  model: "308",
  year: 2023,
  km: 15000,
  moteur: "Diesel",
  prix: 25000,
  lld: true,
  mensualite: 299,
  img: "https://example.com/308.jpg",
  visible_catalogue: false,
  specs: { carburant: "Diesel", boite: "Automatique", couleur: "Bleu", places: 5, puissance: "130 ch" },
};

const VEHICLE_ACHAT = {
  id: 2,
  make: "Renault",
  model: "Clio",
  year: 2024,
  km: 8000,
  moteur: "Essence",
  prix: 17990,
  lld: false,
  mensualite: null,
  img: "https://example.com/clio.jpg",
  visible_catalogue: true,
  specs: { carburant: "Essence", boite: "Manuelle", couleur: "Rouge", places: 5, puissance: "90 ch" },
};

const VEHICLE_LIST = [VEHICLE_LLD, VEHICLE_ACHAT];

function fillAddForm() {
  fireEvent.change(screen.getByLabelText(/marque \*/i), { target: { value: "Toyota" } });
  fireEvent.change(screen.getByLabelText(/modèle \*/i), { target: { value: "Yaris" } });
  fireEvent.change(screen.getByLabelText(/année \*/i), { target: { value: "2024" } });
  fireEvent.change(screen.getByLabelText(/kilométrage \*/i), { target: { value: "5000" } });
  fireEvent.change(screen.getByLabelText(/prix de vente/i), { target: { value: "18990" } });
  fireEvent.change(screen.getByLabelText(/couleur \*/i), { target: { value: "Blanc" } });
  fireEvent.change(screen.getByLabelText(/puissance \*/i), { target: { value: "100 ch" } });
  fireEvent.change(screen.getByLabelText(/url photo principale/i), {
    target: { value: "https://example.com/yaris.jpg" },
  });
}

describe("GestionVehiculesPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Chargement et affichage ─────────────────────────────────────────────────

  it("appelle GET /api/v1/vehicules/backoffice au chargement", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/vehicules/backoffice"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("affiche le titre de la page", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/gestion des véhicules/i).length).toBeGreaterThan(0);
    });
  });

  it("affiche la liste des véhicules avec marque et modèle", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => VEHICLE_LIST } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByText("Peugeot 308")).toBeInTheDocument();
      expect(screen.getByText("Renault Clio")).toBeInTheDocument();
    });
  });

  it("affiche les badges LLD et Achat", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => VEHICLE_LIST } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getAllByText("LLD").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Achat").length).toBeGreaterThan(0);
    });
  });

  it("affiche les badges Visible et Masqué", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => VEHICLE_LIST } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByText("Visible")).toBeInTheDocument();
      expect(screen.getByText("Masqué")).toBeInTheDocument();
    });
  });

  it("affiche la barre de statistiques (Total, LLD, Achat, Masqués)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => VEHICLE_LIST } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("Masqués")).toBeInTheDocument();
    });
  });

  it("affiche l'état vide quand aucun véhicule n'existe", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByText(/aucun véhicule/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si le chargement échoue", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Non autorisé." }),
    } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  // ── Modal ajout ─────────────────────────────────────────────────────────────

  it("affiche le bouton 'Nouveau véhicule'", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nouveau véhicule/i })).toBeInTheDocument();
    });
  });

  it("ouvre le modal au clic sur 'Nouveau véhicule'", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => {
      expect(screen.getByText("Ajouter un véhicule")).toBeInTheDocument();
      expect(screen.getByLabelText(/marque \*/i)).toBeInTheDocument();
    });
  });

  it("ferme le modal avec le bouton ×", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByRole("button", { name: /fermer/i }));
    fireEvent.click(screen.getByRole("button", { name: /fermer/i }));
    await waitFor(() => {
      expect(screen.queryByText("Ajouter un véhicule")).not.toBeInTheDocument();
    });
  });

  it("ferme le modal avec la touche Escape", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByLabelText(/marque \*/i));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByLabelText(/marque \*/i)).not.toBeInTheDocument();
    });
  });

  it("affiche les erreurs de validation si le formulaire est soumis vide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByRole("button", { name: /ajouter au catalogue/i }));
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));
    await waitFor(() => {
      expect(screen.getByText(/la marque est obligatoire/i)).toBeInTheDocument();
    });
  });

  it("appelle POST /api/v1/vehicules/creer et ajoute le véhicule à la liste", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 99, reference: "VEH-00099", message: "Ajouté." }),
      } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByLabelText(/marque \*/i));
    fillAddForm();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/vehicules/creer"),
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("affiche une erreur API si la création échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Accès refusé." }),
      } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByLabelText(/marque \*/i));
    fillAddForm();
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain("Accès refusé.");
    });
  });

  it("affiche le champ mensualité quand LLD est sélectionné", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByDisplayValue("lld"));
    fireEvent.click(screen.getByDisplayValue("lld"));
    expect(screen.getByLabelText(/mensualité lld/i)).toBeInTheDocument();
  });

  it("valide que la mensualité est obligatoire si LLD est coché", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouveau véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    await waitFor(() => screen.getByDisplayValue("lld"));
    fireEvent.click(screen.getByDisplayValue("lld"));
    fillAddForm();
    // Mensualité volontairement non remplie
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));
    await waitFor(() => {
      expect(screen.getByText(/mensualité lld ht est obligatoire/i)).toBeInTheDocument();
    });
  });

  // ── Modal modification ──────────────────────────────────────────────────────

  it("ouvre le modal modification pré-rempli avec les données du véhicule", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /modifier renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /modifier renault clio/i }));
    await waitFor(() => {
      const makeInput = screen.getByLabelText(/marque \*/i) as HTMLInputElement;
      expect(makeInput.value).toBe("Renault");
      const modelInput = screen.getByLabelText(/modèle \*/i) as HTMLInputElement;
      expect(modelInput.value).toBe("Clio");
    });
  });

  it("appelle PATCH /api/v1/vehicules/{id} au submit en mode modification", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => VEHICLE_ACHAT } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /modifier renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /modifier renault clio/i }));
    await waitFor(() => screen.getByRole("button", { name: /enregistrer/i }));
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/vehicules/${VEHICLE_ACHAT.id}`),
        expect.objectContaining({ method: "PATCH", credentials: "include" }),
      );
    });
  });

  // ── Suppression ─────────────────────────────────────────────────────────────

  it("affiche un bouton Supprimer pour chaque véhicule", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => VEHICLE_LIST } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /supprimer/i });
      expect(buttons.length).toBe(VEHICLE_LIST.length);
    });
  });

  it("affiche la confirmation avant suppression", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /supprimer renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /supprimer renault clio/i }));
    await waitFor(() => {
      expect(screen.getByText(/confirmer/i)).toBeInTheDocument();
      expect(screen.getByText("Oui")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^non$/i })).toBeInTheDocument();
    });
  });

  it("annule la suppression avec 'Non'", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /supprimer renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /supprimer renault clio/i }));
    await waitFor(() => screen.getByText("Oui"));
    fireEvent.click(screen.getByRole("button", { name: /^non$/i }));
    await waitFor(() => {
      expect(screen.queryByText(/confirmer/i)).not.toBeInTheDocument();
    });
  });

  it("appelle DELETE et retire le véhicule de la liste après confirmation", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /supprimer renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /supprimer renault clio/i }));
    await waitFor(() => screen.getByText("Oui"));
    fireEvent.click(screen.getByRole("button", { name: /confirmer la suppression de renault clio/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/vehicules/${VEHICLE_ACHAT.id}`),
        expect.objectContaining({ method: "DELETE", credentials: "include" }),
      );
      expect(screen.queryByText("Renault Clio")).not.toBeInTheDocument();
    });
  });

  // ── Bascule LLD ──────────────────────────────────────────────────────────────

  it("affiche un bouton de bascule pour chaque véhicule", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => VEHICLE_LIST } as Response);
    render(<GestionVehiculesPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /basculer peugeot 308 en vente/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /basculer renault clio en lld/i })).toBeInTheDocument();
    });
  });

  it("bascule immédiatement le mode si aucun dossier actif et affiche un toast", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vehicle: { ...VEHICLE_ACHAT, lld: true, mensualite: null },
          toggled: true,
          warning: null,
          active_dossiers_count: 0,
        }),
      } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /basculer renault clio en lld/i }));
    fireEvent.click(screen.getByRole("button", { name: /basculer renault clio en lld/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("affiche un avertissement si des dossiers actifs existent", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vehicle: VEHICLE_ACHAT,
          toggled: false,
          warning: "Ce véhicule a 2 dossiers actifs.",
          active_dossiers_count: 2,
        }),
      } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /basculer renault clio en lld/i }));
    fireEvent.click(screen.getByRole("button", { name: /basculer renault clio en lld/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirmer la bascule de renault clio/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /annuler la bascule de renault clio/i })).toBeInTheDocument();
    });
  });

  it("appelle toggle avec ?confirm=true après confirmation de l'avertissement", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicle: VEHICLE_ACHAT, toggled: false, warning: "1 dossier actif.", active_dossiers_count: 1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicle: { ...VEHICLE_ACHAT, lld: true }, toggled: true, active_dossiers_count: 1 }),
      } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /basculer renault clio en lld/i }));
    fireEvent.click(screen.getByRole("button", { name: /basculer renault clio en lld/i }));
    await waitFor(() => screen.getByRole("button", { name: /confirmer la bascule de renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmer la bascule de renault clio/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("confirm=true"),
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
  });

  it("annule l'avertissement de bascule avec le bouton Annuler", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [VEHICLE_ACHAT] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicle: VEHICLE_ACHAT, toggled: false, warning: "1 dossier actif.", active_dossiers_count: 1 }),
      } as Response);

    render(<GestionVehiculesPage />);
    await waitFor(() => screen.getByRole("button", { name: /basculer renault clio en lld/i }));
    fireEvent.click(screen.getByRole("button", { name: /basculer renault clio en lld/i }));
    await waitFor(() => screen.getByRole("button", { name: /annuler la bascule de renault clio/i }));
    fireEvent.click(screen.getByRole("button", { name: /annuler la bascule de renault clio/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /confirmer la bascule/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /basculer renault clio en lld/i })).toBeInTheDocument();
    });
  });
});
