import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileManagementClient from "@/app/espace-client/ProfileManagementClient";

describe("ProfileManagementClient", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
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
});
