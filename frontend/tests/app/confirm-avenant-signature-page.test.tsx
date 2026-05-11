import { render, screen, waitFor } from "@testing-library/react";
import ConfirmAvenantSignaturePage from "@/app/confirm-avenant-signature/page";

describe("ConfirmAvenantSignaturePage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.history.pushState({}, "", "/confirm-avenant-signature");
  });

  it("affiche une erreur quand le token est absent", async () => {
    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/lien de confirmation invalide/i)).toBeInTheDocument();
    });
  });

  it("confirme la signature quand le token est valide", async () => {
    window.history.pushState({}, "", "/confirm-avenant-signature?token=ok-token");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Avenant signé avec succès." }),
    } as Response);

    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
      expect(screen.getByText(/avenant signé/i)).toBeInTheDocument();
    });
  });

  it("utilise le message par defaut si l'API ne renvoie pas de message", async () => {
    window.history.pushState({}, "", "/confirm-avenant-signature?token=t2");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/Avenant signé/i);
    });
  });

  it("affiche le detail d'erreur si l'API refuse la confirmation", async () => {
    window.history.pushState({}, "", "/confirm-avenant-signature?token=bad");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Lien de signature invalide." }),
    } as Response);

    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/lien de signature invalide/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur technique si fetch leve", async () => {
    window.history.pushState({}, "", "/confirm-avenant-signature?token=t3");
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));

    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
  });

  it("utilise le corps texte si json() echoue", async () => {
    window.history.pushState({}, "", "/confirm-avenant-signature?token=t4");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
      clone: () => ({
        text: async () => "Corps brut d'erreur",
      }),
    } as unknown as Response);

    render(<ConfirmAvenantSignaturePage />);

    await waitFor(() => {
      expect(screen.getByText(/corps brut d'erreur/i)).toBeInTheDocument();
    });
  });

  it("appelle l'API avec l'URL absolue si NEXT_PUBLIC_API_URL est defini", async () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.test/";
    window.history.pushState({}, "", "/confirm-avenant-signature?token=abs");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "OK" }),
    } as Response);

    try {
      render(<ConfirmAvenantSignaturePage />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^https:\/\/api\.test\/api\/v1\/auth\/confirm-avenant-signature\?token=abs$/),
        );
      });
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_API_URL;
      } else {
        process.env.NEXT_PUBLIC_API_URL = prev;
      }
    }
  });
});
