import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileManagementClient from "@/app/espace-client/ProfileManagementClient";

describe("ProfileManagementClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const baseUser = {
    id: 1,
    email: "client@example.com",
    role: "client",
    first_name: "Alice",
    last_name: "Martin",
    phone: "0102030405",
    email_verified: true,
  };

  it("sauvegarde le profil et affiche une confirmation visuelle", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "Profil mis a jour avec succes." }) } as Response);

    render(<ProfileManagementClient initialUser={baseUser} />);

    fireEvent.change(screen.getByPlaceholderText("Prenom"), { target: { value: "Alicia" } });
    fireEvent.click(screen.getByRole("button", { name: /sauvegarder le profil/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/profile$/),
        expect.objectContaining({ method: "PUT", credentials: "include" }),
      );
      expect(screen.getByText(/profil mis a jour avec succes/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur sur ancien mot de passe invalide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Ancien mot de passe invalide." }),
    } as Response);

    render(<ProfileManagementClient initialUser={baseUser} />);

    fireEvent.change(screen.getByPlaceholderText("Ancien mot de passe"), { target: { value: "bad" } });
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "StrongPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: /mettre a jour le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/ancien mot de passe invalide/i)).toBeInTheDocument();
    });
  });

  it("affiche l'etat email a confirmer et utilise les messages par défaut", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

    render(<ProfileManagementClient initialUser={{ ...baseUser, email_verified: false }} />);

    expect(screen.getByText(/etat email: a confirmer/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sauvegarder le profil/i }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "https://api.example.com/api/v1/auth/profile",
        expect.objectContaining({ method: "PUT" }),
      );
      expect(screen.getByText(/profil mis a jour avec succes/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Ancien mot de passe"), { target: { value: "old-pass" } });
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "StrongPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: /mettre a jour le mot de passe/i }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "https://api.example.com/api/v1/auth/change-password",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByText(/mot de passe mis a jour avec succes/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur technique si l'appel échoue sans objet Error", async () => {
    jest.spyOn(global, "fetch").mockRejectedValueOnce("network-down");
    render(<ProfileManagementClient initialUser={baseUser} />);

    fireEvent.click(screen.getByRole("button", { name: /sauvegarder le profil/i }));
    await waitFor(() => {
      expect(screen.getByText(/erreur technique/i)).toBeInTheDocument();
    });
  });

  it("n'affiche pas la demande d'effacement RGPD pour un non-client", () => {
    render(<ProfileManagementClient initialUser={{ ...baseUser, role: "gestionnaire" }} />);
    expect(screen.queryByRole("button", { name: /demander la suppression/i })).not.toBeInTheDocument();
  });

  it("soumet la demande d'effacement RGPD apres confirmation", async () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Demande enregistree." }),
    } as Response);
    try {
      render(<ProfileManagementClient initialUser={baseUser} />);
      fireEvent.click(screen.getByRole("button", { name: /demander la suppression/i }));
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringMatching(/request-data-erasure$/),
          expect.objectContaining({ method: "POST", credentials: "include" }),
        );
        expect(screen.getByText(/demande enregistree/i)).toBeInTheDocument();
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("n'appelle pas l'API d'effacement si l'utilisateur annule la confirmation", () => {
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    const fetchSpy = jest.spyOn(global, "fetch");
    try {
      render(<ProfileManagementClient initialUser={baseUser} />);
      fireEvent.click(screen.getByRole("button", { name: /demander la suppression/i }));
      const erasureCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("request-data-erasure"));
      expect(erasureCalls).toHaveLength(0);
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("affiche le detail d'erreur si la demande d'effacement est refusee", async () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "Deja supprime." }),
    } as Response);
    try {
      render(<ProfileManagementClient initialUser={baseUser} />);
      fireEvent.click(screen.getByRole("button", { name: /demander la suppression/i }));
      await waitFor(() => {
        expect(screen.getByText(/deja supprime/i)).toBeInTheDocument();
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("affiche une erreur technique si la demande d'effacement leve", async () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    jest.spyOn(global, "fetch").mockRejectedValueOnce("boom");
    try {
      render(<ProfileManagementClient initialUser={baseUser} />);
      fireEvent.click(screen.getByRole("button", { name: /demander la suppression/i }));
      await waitFor(() => {
        expect(screen.getByText(/erreur technique/i)).toBeInTheDocument();
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("utilise le message serveur par defaut pour l'effacement si absent", async () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);
    try {
      render(<ProfileManagementClient initialUser={baseUser} />);
      fireEvent.click(screen.getByRole("button", { name: /demander la suppression/i }));
      await waitFor(() => {
        expect(screen.getByText(/demande enregistree/i)).toBeInTheDocument();
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("affiche l'etat email non verifie et le titre Mon profil en mode page", () => {
    render(<ProfileManagementClient initialUser={{ ...baseUser, email_verified: false }} variant="page" />);
    expect(screen.getByText(/etat email: a confirmer/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /mon profil/i })).toBeInTheDocument();
  });

  it("affiche la section RGPD en variante modale", () => {
    render(<ProfileManagementClient initialUser={baseUser} variant="modal" />);
    expect(screen.getByRole("heading", { name: /donnees personnelles/i })).toBeInTheDocument();
  });
});
