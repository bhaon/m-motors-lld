import { fireEvent, render, screen } from "@testing-library/react";
import VehicleCard from "@/components/VehicleCard";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("VehicleCard", () => {
  it("affiche le badge achat pour un véhicule sans LLD", () => {
    const v = SAMPLE_VEHICLES.find((x) => !x.lld);
    expect(v).toBeDefined();
    render(<VehicleCard vehicle={v} onClick={jest.fn()} />);
    expect(screen.getByText("Achat uniquement")).toBeInTheDocument();
  });

  it("déclenche onClick sur la carte et le bouton", () => {
    const onClick = jest.fn();
    const vehicle = SAMPLE_VEHICLES[0];

    render(<VehicleCard vehicle={vehicle} onClick={onClick} />);

    fireEvent.click(screen.getByText("Voir la fiche"));
    expect(onClick).toHaveBeenCalledWith(vehicle);

    fireEvent.click(screen.getByText(vehicle.model, { exact: false }));
    expect(onClick).toHaveBeenCalledTimes(2);

    const card = document.querySelector(".vehicle-card");
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
  });
});
