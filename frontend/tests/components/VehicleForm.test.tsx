import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VehicleForm, INITIAL_FORM, vehicleToForm } from "@/components/VehicleForm";
import type { VehicleBoItem } from "@/components/VehicleForm";

const SAMPLE_VEHICLE: VehicleBoItem = {
  id: 7,
  make: "Renault",
  model: "Clio",
  year: 2022,
  km: 15000,
  moteur: "Essence",
  prix: 14990,
  lld: false,
  mensualite: null,
  img: "https://example.com/clio.jpg",
  archived: false,
  archived_at: null,
  visible_catalogue: true,
  specs: { carburant: "Essence", boite: "Manuelle", couleur: "Rouge", places: 5, puissance: "100 ch" },
  options: [],
};

describe("vehicleToForm", () => {
  it("convertit correctement un VehicleBoItem en FormState", () => {
    const form = vehicleToForm(SAMPLE_VEHICLE);
    expect(form.make).toBe("Renault");
    expect(form.year).toBe("2022");
    expect(form.mensualite).toBe("");
    expect(form.lld).toBe(false);
  });
});

describe("VehicleForm — mode add", () => {
  it("affiche les champs obligatoires", () => {
    render(<VehicleForm mode="add" initial={INITIAL_FORM} onSuccess={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByLabelText(/marque/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/modèle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prix de vente/i)).toBeInTheDocument();
  });

  it("affiche les erreurs de validation si le formulaire est soumis vide", async () => {
    render(<VehicleForm mode="add" initial={INITIAL_FORM} onSuccess={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));
    await waitFor(() => expect(screen.getByText("La marque est obligatoire.")).toBeInTheDocument());
  });

  it("appelle onCancel au clic sur Annuler", () => {
    const onCancel = jest.fn();
    render(<VehicleForm mode="add" initial={INITIAL_FORM} onSuccess={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /annuler/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("affiche le champ mensualité uniquement si LLD est coché", () => {
    render(<VehicleForm mode="add" initial={INITIAL_FORM} onSuccess={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByLabelText(/mensualité/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /lld/i }));
    expect(screen.getByLabelText(/mensualité/i)).toBeInTheDocument();
  });

  it("soumet le formulaire et appelle onSuccess avec un VehicleBoItem reconstruit", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, reference: "VEH-0042", message: "Créé" }),
    });
    const onSuccess = jest.fn();
    render(<VehicleForm mode="add" initial={INITIAL_FORM} onSuccess={onSuccess} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/marque/i), { target: { value: "Peugeot" } });
    fireEvent.change(screen.getByLabelText(/modèle/i), { target: { value: "208" } });
    fireEvent.change(screen.getByLabelText(/année/i), { target: { value: "2023" } });
    fireEvent.change(screen.getByLabelText(/kilométrage/i), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText(/prix de vente/i), { target: { value: "18000" } });
    fireEvent.change(screen.getByLabelText(/couleur/i), { target: { value: "Blanc" } });
    fireEvent.change(screen.getByLabelText(/puissance/i), { target: { value: "130 ch" } });
    fireEvent.change(screen.getByLabelText(/url photo principale/i), { target: { value: "https://example.com/208.jpg" } });

    fireEvent.click(screen.getByRole("button", { name: /ajouter au catalogue/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 42, make: "Peugeot", model: "208" }),
        true,
        expect.anything(), // reference (3e arg)
        expect.anything(), // message (4e arg)
      );
    });
  });
});

describe("VehicleForm — mode edit", () => {
  it("affiche le bouton Enregistrer en mode edit", () => {
    const initial = vehicleToForm(SAMPLE_VEHICLE);
    render(<VehicleForm mode="edit" initial={initial} targetId={7} onSuccess={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole("button", { name: /enregistrer/i })).toBeInTheDocument();
  });
});
