import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuthModal from "@/components/AuthModal";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("AuthModal", () => {
  const noop = () => {};

  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    pushMock.mockClear();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("connexion", () => {
    it("redirige vers l'espace client après connexion réussie", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ message: "Connexion reussie." }),
      } as Response);

      render(<AuthModal open defaultTab="login" onClose={noop} />);

      fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
      fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/");
      });
    });

    it("ne redirige pas vers / lorsque redirectAfterLogin vaut false", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ message: "Connexion reussie." }),
      } as Response);

      render(<AuthModal open defaultTab="login" onClose={noop} redirectAfterLogin={false} />);

      fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "client@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "UltraSecure123!" } });
      fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

      await waitFor(() => {
        expect(pushMock).not.toHaveBeenCalled();
      });
    });

    it("affiche le lien Mot de passe oublié", () => {
      render(<AuthModal open defaultTab="login" onClose={noop} />);
      expect(screen.getByRole("link", { name: /mot de passe oublié/i })).toHaveAttribute("href", "/mot-de-passe-oublie");
    });

    it("affiche un message d'erreur générique en cas d'échec", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        json: async () => ({ detail: "Email ou mot de passe invalide." }),
      } as Response);

      render(<AuthModal open defaultTab="login" onClose={noop} />);

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

      render(<AuthModal open defaultTab="login" onClose={noop} />);

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
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            detail: "Votre email n'est pas confirme. Veuillez valider votre email via le lien recu par mail.",
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: "Un nouvel email de confirmation vous a ete envoye." }),
        } as Response);

      render(<AuthModal open defaultTab="login" onClose={noop} />);

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

      render(<AuthModal open defaultTab="login" onClose={noop} />);
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

      render(<AuthModal open defaultTab="login" onClose={noop} />);
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

      render(<AuthModal open defaultTab="login" onClose={noop} />);
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

      render(<AuthModal open defaultTab="login" onClose={noop} />);
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

  describe("inscription", () => {
    it("envoie le formulaire et affiche un message de confirmation", async () => {
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ message: "Inscription reussie. Verifiez votre email." }),
      } as Response);

      render(<AuthModal open defaultTab="register" onClose={noop} />);

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "new.user@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
        target: { value: "StrongPassword123!" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), {
        target: { value: "StrongPassword123!" },
      });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), {
        target: { value: "Alice" },
      });
      fireEvent.change(screen.getByPlaceholderText("Nom"), {
        target: { value: "Martin" },
      });
      const birthDateInput = document.querySelector('input[type="date"]');
      expect(birthDateInput).not.toBeNull();
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1990-01-01" } });

      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));

      fireEvent.click(screen.getByRole("button", { name: /s'inscrire/i }));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/inscription reussie/i)).toBeInTheDocument();
      });
    });

    it("active le bouton seulement si CGU et politique sont cochees", () => {
      render(<AuthModal open defaultTab="register" onClose={noop} />);

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "new.user@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
        target: { value: "StrongPassword123!" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), {
        target: { value: "StrongPassword123!" },
      });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), {
        target: { value: "Alice" },
      });
      fireEvent.change(screen.getByPlaceholderText("Nom"), {
        target: { value: "Martin" },
      });
      const birthDateInput = document.querySelector('input[type="date"]');
      expect(birthDateInput).not.toBeNull();
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1990-01-01" } });

      const submitButton = screen.getByRole("button", { name: /s'inscrire/i });
      expect(submitButton).toBeDisabled();

      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      expect(submitButton).toBeDisabled();

      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));
      expect(submitButton).toBeEnabled();
    });

    it("affiche une erreur si l'API renvoie un echec", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        json: async () => ({ detail: "Un compte existe deja avec cet email." }),
      } as Response);

      render(<AuthModal open defaultTab="register" onClose={noop} />);

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "existing@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
        target: { value: "StrongPassword123!" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), {
        target: { value: "StrongPassword123!" },
      });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), {
        target: { value: "Bob" },
      });
      fireEvent.change(screen.getByPlaceholderText("Nom"), {
        target: { value: "Dupont" },
      });
      const birthDateInput = document.querySelector('input[type="date"]');
      expect(birthDateInput).not.toBeNull();
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1988-02-10" } });

      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));
      fireEvent.click(screen.getByRole("button", { name: /s'inscrire/i }));

      await waitFor(() => {
        expect(screen.getByText(/un compte existe deja/i)).toBeInTheDocument();
      });
    });

    it("utilise NEXT_PUBLIC_API_URL pour l'inscription", async () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ message: "ok" }),
      } as Response);

      render(<AuthModal open defaultTab="register" onClose={noop} />);
      fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new.user@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), { target: { value: "Alice" } });
      fireEvent.change(screen.getByPlaceholderText("Nom"), { target: { value: "Martin" } });
      const birthDateInput = document.querySelector('input[type="date"]');
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1990-01-01" } });
      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));
      fireEvent.click(screen.getByRole("button", { name: /s'inscrire/i }));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/v1/auth/register", expect.any(Object));
      });
    });

    it("utilise le fallback d'erreur inscription impossible si payload vide", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("not json");
        },
        clone: () => ({
          text: async () => "",
        }),
      } as unknown as Response);

      render(<AuthModal open defaultTab="register" onClose={noop} />);
      fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new.user@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), { target: { value: "Alice" } });
      fireEvent.change(screen.getByPlaceholderText("Nom"), { target: { value: "Martin" } });
      const birthDateInput = document.querySelector('input[type="date"]');
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1990-01-01" } });
      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));
      fireEvent.click(screen.getByRole("button", { name: /s'inscrire/i }));

      await waitFor(() => {
        expect(screen.getByText("Inscription impossible.")).toBeInTheDocument();
      });
    });

    it("affiche une erreur technique si fetch rejette sans objet Error", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue("network-down");

      render(<AuthModal open defaultTab="register" onClose={noop} />);
      fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new.user@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), { target: { value: "Alice" } });
      fireEvent.change(screen.getByPlaceholderText("Nom"), { target: { value: "Martin" } });
      const birthDateInput = document.querySelector('input[type="date"]');
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1990-01-01" } });
      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));
      fireEvent.click(screen.getByRole("button", { name: /s'inscrire/i }));

      await waitFor(() => {
        expect(screen.getByText("Erreur technique.")).toBeInTheDocument();
      });
    });

    it("désactive l'inscription si les mots de passe ne correspondent pas", () => {
      render(<AuthModal open defaultTab="register" onClose={noop} />);

      fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new.user@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "StrongPassword123!" } });
      fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), {
        target: { value: "StrongPassword123!Different" },
      });
      fireEvent.change(screen.getByPlaceholderText("Prenom"), { target: { value: "Alice" } });
      fireEvent.change(screen.getByPlaceholderText("Nom"), { target: { value: "Martin" } });
      const birthDateInput = document.querySelector('input[type="date"]');
      expect(birthDateInput).not.toBeNull();
      fireEvent.change(birthDateInput as HTMLInputElement, { target: { value: "1990-01-01" } });

      fireEvent.click(screen.getByLabelText(/J.accepte les CGU/i));
      fireEvent.click(screen.getByLabelText(/J.accepte la politique/i));

      expect(screen.getByRole("button", { name: /s'inscrire/i })).toBeDisabled();
    });
  });
});
