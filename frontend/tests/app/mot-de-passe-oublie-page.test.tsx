import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/mot-de-passe-oublie/page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("envoie la demande de reset et affiche un message de succès", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Si un compte existe avec cet email, un lien de reinitialisation a ete envoye." }),
    } as Response);

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /envoyer un lien de réinitialisation/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/forgot-password$/),
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByText(/si un compte existe/i)).toBeInTheDocument();
    });
  });
});
