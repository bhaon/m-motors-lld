import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConnexionPage from "@/app/connexion/page";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("ConnexionPage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    pushMock.mockClear();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
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

  it("affiche le lien Mot de passe oublié", () => {
    render(<ConnexionPage />);
    expect(screen.getByRole("link", { name: /mot de passe oublié/i })).toHaveAttribute("href", "/mot-de-passe-oublie");
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

  it("affiche le bouton de renvoi quand l'email n'est pas confirmé", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({
        detail: "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.",
      }),
    } as Response);

    render(<ConnexionPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i })).toBeInTheDocument();
    });
  });

  it("renvoie un email de confirmation quand l'utilisateur clique sur le bouton", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      // login => email non confirmé
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          detail: "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.",
        }),
      } as Response)
      // resend => ok
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Un nouvel email de confirmation vous a ete envoye." }),
      } as Response);

    render(<ConnexionPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/nouvel email de confirmation/i)).toBeInTheDocument();
    });
  });

  it("utilise NEXT_PUBLIC_API_URL pour login et resend", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          detail: "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "ok" }),
      } as Response);

    render(<ConnexionPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(1, "https://api.example.com/api/v1/auth/login", expect.any(Object));
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "https://api.example.com/api/v1/auth/resend-confirmation",
        expect.any(Object),
      );
    });
  });

  it("utilise le fallback texte pour l'erreur de connexion", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error("not json");
        },
        clone: () => ({
          text: async () => "",
        }),
      } as unknown as Response);

    render(<ConnexionPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText(/email ou mot de passe invalide/i)).toBeInTheDocument();
    });
  });

  it("affiche le message resend par défaut si le backend ne renvoie pas detail", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          detail: "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response);

    render(<ConnexionPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i }));
    await waitFor(() => {
      expect(screen.getByText(/réémission impossible/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur technique si le resend échoue sans objet Error", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          detail: "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.",
        }),
      } as Response)
      .mockRejectedValueOnce("down");

    render(<ConnexionPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /renvoyer l'email de confirmation/i }));

    await waitFor(() => {
      expect(screen.getByText("Erreur technique.")).toBeInTheDocument();
    });
  });
});
