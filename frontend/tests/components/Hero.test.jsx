import { render, screen } from "@testing-library/react";
import Hero from "@/components/Hero";

describe("Hero", () => {
  it("affiche le nombre de véhicules", () => {
    render(<Hero vehicleCount={12} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("véhicules")).toBeInTheDocument();
  });
});
