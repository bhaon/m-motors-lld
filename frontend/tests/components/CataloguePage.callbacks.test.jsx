import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CataloguePage from "@/components/CataloguePage";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

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

describe("CataloguePage callbacks", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockPush.mockClear();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => [] }));
  });

  it("couvre le callback onClose du VehicleModal avec catalogue vide", () => {
    render(<CataloguePage vehicles={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer véhicule" }));
    expect(screen.getByText("Catalogue vide")).toBeInTheDocument();
  });

  it("après création dossier déclenche la navigation vers Mes dossiers", async () => {
    global.fetch = jest.fn((url, init) => {
      const u = typeof url === "string" ? url : String(url);
      const method = (init?.method || "GET").toUpperCase();
      if (u.includes("/api/v1/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 9,
            email: "a@b",
            role: "client",
            first_name: "A",
            last_name: "B",
            phone: null,
            email_verified: true,
          }),
        });
      }
      if (method === "POST" && u.includes("/api/v1/dossiers")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 12, reference: "DOS-2026-00012" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    render(
      <CataloguePage
        vehicles={[{ id: 1, marque: "A", modele: "B", prix: 1, energie: "Essence", km: 10, boite: "Manuelle", lld: true, image_url: "" }]}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/me"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /ouvrir véhicule/i }));
    fireEvent.click(screen.getByRole("button", { name: "Demander dossier" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer dossier" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/mes-dossiers?cree=1&ref=DOS-2026-00012&id=12&type=LLD",
      );
    });
  });
});
