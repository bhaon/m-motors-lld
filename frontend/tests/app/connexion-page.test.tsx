import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConnexionPage from "@/app/connexion/page";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("ConnexionPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    pushMock.mockClear();
  });

  it("redirige vers l'espace client après connexion réussie", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Connexion reussie." }),
    } as Response);

    render(<ConnexionPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/espace-client");
    });
  });

  it("affiche un message d'erreur générique en cas d'échec", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Email ou mot de passe invalide." }),
    } as Response);

    render(<ConnexionPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "mauvais" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText(/email ou mot de passe invalide/i)).toBeInTheDocument();
    });
  });
});
