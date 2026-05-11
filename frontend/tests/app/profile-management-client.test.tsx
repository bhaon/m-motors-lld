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
});
