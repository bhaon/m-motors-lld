import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CataloguePage from "@/components/CataloguePage";

jest.mock("@/components/SearchBar", () => () => <div>SearchBar</div>);
jest.mock("@/components/FiltersRow", () => () => <div>FiltersRow</div>);
jest.mock("@/components/Toast", () => ({ message }) => <div>{message}</div>);

jest.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    toast: { message: "", visible: false },
    showToast: jest.fn(),
  }),
}));

jest.mock("@/hooks/useFilters", () => ({
  useFilters: (vehicles) => ({
    filters: { marque: "", modele: "", moteur: "", kmMax: "", prixMax: "", type: "all" },
    filtered: vehicles,
    marques: [],
    modeles: [],
    setType: jest.fn(),
    setField: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock("@/components/VehicleCard", () => ({ vehicle, onClick }) => (
  <button type="button" onClick={() => onClick(vehicle)}>
    Ouvrir véhicule {vehicle.id}
  </button>
));

jest.mock("@/components/VehicleModal", () => ({ vehicle, onClose, onDossier }) => (
  <div>
    <button type="button" onClick={onClose}>
      Fermer véhicule
    </button>
    {vehicle ? (
      <button type="button" onClick={() => onDossier(vehicle, "lld")}>
        Demander dossier
      </button>
    ) : null}
  </div>
));

jest.mock("@/components/DossierConfirmModal", () => ({ onConfirm, onCancel }) => (
  <div>
    <button type="button" onClick={onConfirm}>
      Confirmer dossier
    </button>
    <button type="button" onClick={onCancel}>
      Annuler dossier
    </button>
  </div>
));

jest.mock("@/components/DossierPiecesModal", () => ({ dossierReference, onClose }) => (
  <div>
    <span>{dossierReference}</span>
    <button type="button" onClick={onClose}>
      Fermer pièces
    </button>
  </div>
));

describe("CataloguePage callbacks", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("couvre le callback onClose du VehicleModal avec catalogue vide", () => {
    render(<CataloguePage vehicles={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer véhicule" }));
    expect(screen.getByText("Catalogue vide")).toBeInTheDocument();
  });

  it("couvre le callback onClose du DossierPiecesModal après création", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: 12, reference: "DOS-2026-00012" }),
    });

    render(
      <CataloguePage
        vehicles={[{ id: 1, marque: "A", modele: "B", prix: 1, energie: "Essence", km: 10, boite: "Manuelle", lld: true, image_url: "" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ouvrir véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: "Demander dossier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer dossier" }));

    await waitFor(() => {
      expect(screen.getByText("DOS-2026-00012")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Fermer pièces" }));
    await waitFor(() => {
      expect(screen.queryByText("DOS-2026-00012")).not.toBeInTheDocument();
    });
  });
});
