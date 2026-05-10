import { render, screen, waitFor } from "@testing-library/react";
import ConfirmContractSignaturePage from "@/app/confirm-contract-signature/page";

describe("ConfirmContractSignaturePage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.history.pushState({}, "", "/confirm-contract-signature");
  });

  it("affiche une erreur quand le token est absent", async () => {
    render(<ConfirmContractSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/lien de confirmation invalide/i)).toBeInTheDocument();
    });
  });

  it("confirme la signature quand le token est valide", async () => {
    window.history.pushState({}, "", "/confirm-contract-signature?token=ok-token");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Signature enregistrée avec succès." }),
    } as Response);

    render(<ConfirmContractSignaturePage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
      expect(screen.getByText(/signature enregistrée/i)).toBeInTheDocument();
    });
  });

  it("affiche l'erreur de l'API si la confirmation echoue", async () => {
    window.history.pushState({}, "", "/confirm-contract-signature?token=bad");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Lien de signature expire." }),
    } as Response);

    render(<ConfirmContractSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/expire/i)).toBeInTheDocument();
    });
  });

  it("lit un message texte quand l'API ne renvoie pas de JSON", async () => {
    window.history.pushState({}, "", "/confirm-contract-signature?token=x");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({
        text: async () => "Erreur serveur brute",
      }),
    } as unknown as Response);

    render(<ConfirmContractSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/erreur serveur brute/i)).toBeInTheDocument();
    });
  });

  it("affiche le fallback par défaut quand la réponse ne fournit aucun détail", async () => {
    window.history.pushState({}, "", "/confirm-contract-signature?token=y");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({}),
    } as unknown as Response);

    render(<ConfirmContractSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText("Confirmation impossible.")).toBeInTheDocument();
    });
  });
});
