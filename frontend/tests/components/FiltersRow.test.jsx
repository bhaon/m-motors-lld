import { fireEvent, render, screen } from "@testing-library/react";
import FiltersRow from "@/components/FiltersRow";

describe("FiltersRow", () => {
  it("affiche le compteur et déclenche les callbacks", () => {
    const onType = jest.fn();
    const onReset = jest.fn();

    render(
      <FiltersRow
        activeType="all"
        count={2}
        onType={onType}
        onReset={onReset}
      />,
    );

    expect(screen.getByText("2 véhicules")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Achat"));
    expect(onType).toHaveBeenCalledWith("achat");

    fireEvent.click(screen.getByText("Tous"));
    expect(onType).toHaveBeenCalledWith("all");

    fireEvent.click(screen.getByText("LLD disponible"));
    expect(onType).toHaveBeenCalledWith("lld");

    fireEvent.click(screen.getByText("Réinitialiser les filtres"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("affiche le singulier pour un seul véhicule", () => {
    render(
      <FiltersRow
        activeType="lld"
        count={1}
        onType={jest.fn()}
        onReset={jest.fn()}
      />,
    );
    expect(screen.getByText("1 véhicule")).toBeInTheDocument();
  });
});
