import { fireEvent, render, screen } from "@testing-library/react";
import VehicleModal from "@/components/VehicleModal";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("VehicleModal", () => {
  it("n'affiche rien si aucun véhicule n'est sélectionné", () => {
    const { container } = render(
      <VehicleModal vehicle={null} onClose={jest.fn()} onDossier={jest.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("gère fermeture clavier et actions dossier", () => {
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

  it("affiche les options LLD quand le véhicule en propose", () => {
    const vehicle = SAMPLE_VEHICLES[0];
    expect(vehicle.options.length).toBeGreaterThan(0);

    render(
      <VehicleModal
        vehicle={vehicle}
        onClose={jest.fn()}
        onDossier={jest.fn()}
      />,
    );

    expect(screen.getByText("Options LLD disponibles")).toBeInTheDocument();
    expect(screen.getByText(vehicle.options[0].n)).toBeInTheDocument();
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
});
