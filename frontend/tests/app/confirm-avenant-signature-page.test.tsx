import { render, screen, waitFor } from "@testing-library/react";
import ConfirmAvenantSignaturePage from "@/app/confirm-avenant-signature/page";

describe("ConfirmAvenantSignaturePage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.history.pushState({}, "", "/confirm-avenant-signature");
  });

  it("affiche une erreur quand le token est absent", async () => {
    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/lien de confirmation invalide/i)).toBeInTheDocument();
    });
  });

  it("confirme la signature quand le token est valide", async () => {
    window.history.pushState({}, "", "/confirm-avenant-signature?token=ok-token");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Avenant signé avec succès." }),
    } as Response);

    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
      expect(screen.getByText(/avenant signé/i)).toBeInTheDocument();
    });
  });
});
