import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/mot-de-passe-oublie/page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_API_URL;
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

  it("utilise NEXT_PUBLIC_API_URL quand elle est définie", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://app-dev.netdevops.fr/api";
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "ok" }),
    } as Response);

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /envoyer un lien de réinitialisation/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://app-dev.netdevops.fr/api/api/v1/auth/forgot-password",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("affiche une erreur API si la requête échoue", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Demande refusée" }),
    } as Response);

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /envoyer un lien de réinitialisation/i }));

    await waitFor(() => {
      expect(screen.getByText(/demande refusée/i)).toBeInTheDocument();
    });
  });

  it("gère un payload non JSON et affiche le fallback texte", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({
        text: async () => "Erreur brute",
      }),
    } as unknown as Response);

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /envoyer un lien de réinitialisation/i }));

    await waitFor(() => {
      expect(screen.getByText(/erreur brute/i)).toBeInTheDocument();
    });
  });
});
