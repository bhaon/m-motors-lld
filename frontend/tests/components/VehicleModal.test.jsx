import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VehicleModal from "@/components/VehicleModal";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

const SAMPLE_PHOTOS = [
  { id: 1, url: "https://example.com/photo1.jpg", is_main: true, order: 1 },
  { id: 2, url: "https://example.com/photo2.jpg", is_main: false, order: 2 },
];

const DEFAULT_LLD_STOREFRONT = {
  items: [
    { code: "assurance", label: "Assurance tous risques", surcout_mensuel_ht: 39, enabled: true },
    { code: "assistance", label: "Assistance & dépannage", surcout_mensuel_ht: 9, enabled: true },
    { code: "entretien", label: "Entretien & révisions", surcout_mensuel_ht: 29, enabled: true },
    { code: "controle_technique", label: "Contrôle technique", surcout_mensuel_ht: 5, enabled: true },
  ],
};

function mockFetch(photos = [], lldPayload = DEFAULT_LLD_STOREFRONT) {
  global.fetch = jest.fn().mockImplementation((url) => {
    const u = String(url);
    if (u.includes("/api/v1/lld-catalog")) {
      return Promise.resolve({
        ok: true,
        json: async () => lldPayload,
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => photos,
    });
  });
}

beforeEach(() => mockFetch([]));
afterEach(() => jest.restoreAllMocks());

describe("VehicleModal", () => {
  it("n'affiche rien si aucun véhicule n'est sélectionné", () => {
    const { container } = render(
      <VehicleModal vehicle={null} onClose={jest.fn()} onDossier={jest.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("gère fermeture clavier et actions dossier", async () => {
    const onClose = jest.fn();
    const onDossier = jest.fn();
    const vehicle = SAMPLE_VEHICLES.find((v) => v.lld) || SAMPLE_VEHICLES[0];

    const { unmount } = render(
      <VehicleModal
        vehicle={vehicle}
        onClose={onClose}
        onDossier={onDossier}
      />,
    );

    expect(document.body.classList.contains("modal-open")).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText("Déposer un dossier LLD"));
    expect(onDossier).toHaveBeenCalledWith(vehicle, "lld");

    fireEvent.click(screen.getByText("Déposer un dossier Achat"));
    expect(onDossier).toHaveBeenCalledWith(vehicle, "achat");

    unmount();
    expect(document.body.classList.contains("modal-open")).toBe(false);
  });

  it("ferme la modale au clic sur le fond", () => {
    const onClose = jest.fn();
    const vehicle = SAMPLE_VEHICLES[0];
    render(
      <VehicleModal
        vehicle={vehicle}
        onClose={onClose}
        onDossier={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fermer la modale" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("affiche le parcours achat pour un véhicule sans LLD", () => {
    const vehicle = SAMPLE_VEHICLES.find((v) => !v.lld);
    expect(vehicle).toBeDefined();

    render(
      <VehicleModal
        vehicle={vehicle}
        onClose={jest.fn()}
        onDossier={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Déposer un dossier Achat" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Déposer un dossier LLD" }),
    ).not.toBeInTheDocument();
  });

  it("affiche les quatre options catalogue LLD pour un véhicule LLD", async () => {
    mockFetch([], DEFAULT_LLD_STOREFRONT);
    const vehicle = SAMPLE_VEHICLES.find((x) => x.lld);
    expect(vehicle).toBeDefined();

    await act(async () => {
      render(<VehicleModal vehicle={vehicle} onClose={jest.fn()} onDossier={jest.fn()} />);
    });

    expect(screen.getByText("Options LLD disponibles")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Assurance tous risques")).toBeInTheDocument();
      expect(screen.getByText("Contrôle technique")).toBeInTheDocument();
    });
  });

  it("dépose un dossier achat via le bouton principal sans LLD", () => {
    const vehicle = SAMPLE_VEHICLES.find((v) => !v.lld);
    const onDossier = jest.fn();

    render(
      <VehicleModal
        vehicle={vehicle}
        onClose={jest.fn()}
        onDossier={onDossier}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Déposer un dossier Achat" }),
    );
    expect(onDossier).toHaveBeenCalledWith(vehicle, "achat");
  });

  it("n'affiche pas l'accordéon galerie quand il n'y a aucune photo", async () => {
    mockFetch([]);
    const vehicle = SAMPLE_VEHICLES[0];

    await act(async () => {
      render(<VehicleModal vehicle={vehicle} onClose={jest.fn()} onDossier={jest.fn()} />);
    });

    expect(screen.queryByText(/galerie photos/i)).not.toBeInTheDocument();
  });

  it("affiche l'accordéon galerie quand des photos sont disponibles", async () => {
    mockFetch(SAMPLE_PHOTOS);
    const vehicle = SAMPLE_VEHICLES[0];

    await act(async () => {
      render(<VehicleModal vehicle={vehicle} onClose={jest.fn()} onDossier={jest.fn()} />);
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /galerie photos/i })).toBeInTheDocument()
    );
    expect(screen.getByText(`Galerie photos (${SAMPLE_PHOTOS.length})`)).toBeInTheDocument();
  });

  it("l'accordéon galerie se déploie au clic et affiche les miniatures", async () => {
    mockFetch(SAMPLE_PHOTOS);
    const vehicle = SAMPLE_VEHICLES[0];

    await act(async () => {
      render(<VehicleModal vehicle={vehicle} onClose={jest.fn()} onDossier={jest.fn()} />);
    });

    const toggle = await screen.findByRole("button", { name: /galerie photos/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByAltText("").length).toBeGreaterThan(0);
    expect(screen.getByText("Principale")).toBeInTheDocument();
  });

  it("cliquer sur une miniature change la photo d'en-tête", async () => {
    mockFetch(SAMPLE_PHOTOS);
    const vehicle = SAMPLE_VEHICLES[0];

    await act(async () => {
      render(<VehicleModal vehicle={vehicle} onClose={jest.fn()} onDossier={jest.fn()} />);
    });

    fireEvent.click(await screen.findByRole("button", { name: /galerie photos/i }));
    fireEvent.click(screen.getByRole("button", { name: /afficher photo 2/i }));

    const headerImg = document.querySelector("img[src='https://example.com/photo2.jpg']");
    expect(headerImg).not.toBeNull();
  });
});
