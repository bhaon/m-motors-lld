import { fireEvent, render, screen } from "@testing-library/react";
import AppError from "@/app/error";

describe("AppError", () => {
  it("affiche le message d'erreur et permet de relancer", () => {
    const resetMock = jest.fn();
    render(<AppError error={new Error("Erreur catalogue")} reset={resetMock} />);

    expect(screen.getByText(/catalogue indisponible/i)).toBeInTheDocument();
    expect(screen.getByText(/erreur catalogue/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });
});
