import { render, screen, waitFor } from "@testing-library/react";
import ConfirmEmailPage from "@/app/confirm-email/page";

describe("ConfirmEmailPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.history.pushState({}, "", "/confirm-email");
  });

  it("affiche une erreur quand le token est absent", async () => {
    render(<ConfirmEmailPage />);

    await waitFor(() => {
      expect(screen.getByText(/lien de confirmation invalide/i)).toBeInTheDocument();
    });
  });

  it("confirme l'email quand le token est valide", async () => {
    window.history.pushState({}, "", "/confirm-email?token=test-token");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Votre email a ete confirme avec succes." }),
    } as Response);

    render(<ConfirmEmailPage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/confirme avec succes/i)).toBeInTheDocument();
    });
  });

  it("affiche l'erreur de l'API si la confirmation echoue", async () => {
    window.history.pushState({}, "", "/confirm-email?token=expired-token");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Lien de confirmation expire." }),
    } as Response);

    render(<ConfirmEmailPage />);

    await waitFor(() => {
      expect(screen.getByText(/expire/i)).toBeInTheDocument();
    });
  });

  it("lit un message texte quand l'API ne renvoie pas de JSON", async () => {
    window.history.pushState({}, "", "/confirm-email?token=bad-token");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({
        text: async () => "Erreur texte brute",
      }),
    } as unknown as Response);

    render(<ConfirmEmailPage />);

    await waitFor(() => {
      expect(screen.getByText(/erreur texte brute/i)).toBeInTheDocument();
    });
  });

  it("affiche le fallback par défaut quand la réponse ne fournit aucun détail", async () => {
    window.history.pushState({}, "", "/confirm-email?token=bad-token-2");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({}),
    } as unknown as Response);

    render(<ConfirmEmailPage />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation impossible.")).toBeInTheDocument();
    });
  });
});
