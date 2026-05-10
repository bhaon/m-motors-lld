import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuthModal from "@/components/AuthModal";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("Connexion flow integration", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    pushMock.mockClear();
  });

  it("effectue un login complet et redirige vers l'espace client", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Connexion reussie." }),
    } as Response);

    render(<AuthModal open defaultTab="login" onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "integration@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "VeryStrongPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/login$/),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      );
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });
});
