import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/reset-password/page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_API_URL;
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

  it("utilise NEXT_PUBLIC_API_URL quand elle est définie", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://app-dev.netdevops.fr/api";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "ok" }),
    } as Response);

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://app-dev.netdevops.fr/api/api/v1/auth/reset-password",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("affiche une erreur si le token est absent", async () => {
    window.history.pushState({}, "", "/reset-password");
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/lien de reinitialisation invalide/i)).toBeInTheDocument();
    });
  });

  it("affiche le message d'erreur backend en cas d'échec", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Lien de reinitialisation expire." }),
    } as Response);

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/expire/i)).toBeInTheDocument();
    });
  });

  it("gère le fallback texte si l'API ne renvoie pas de JSON", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({
        text: async () => "Erreur reset texte",
      }),
    } as unknown as Response);

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "NewStrong123!@" } });
    fireEvent.click(screen.getByRole("button", { name: /réinitialiser le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/erreur reset texte/i)).toBeInTheDocument();
    });
  });
});
