import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/reset-password/page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.history.pushState({}, "", "/reset-password?token=test-token");
  });

  it("réinitialise le mot de passe avec un token valide", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Mot de passe reinitialise avec succes." }),
    } as Response);

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/reset-password$/),
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByText(/reinitialise avec succes/i)).toBeInTheDocument();
    });
  });

  it("refuse quand les mots de passe ne correspondent pas", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "Mismatch123!@" } });
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/ne correspondent pas/i)).toBeInTheDocument();
    });
  });
});
