import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileManagementClient from "@/app/espace-client/ProfileManagementClient";

describe("Profile management integration", () => {
  const initialUser = {
    id: 1,
    email: "client@example.com",
    role: "client",
    first_name: "Alice",
    last_name: "Martin",
    phone: "0102030405",
    email_verified: true,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("enchaine sauvegarde profil puis changement mot de passe", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Profil mis a jour avec succes." }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Mot de passe mis a jour avec succes." }),
      } as Response);

    render(<ProfileManagementClient initialUser={initialUser} />);

    fireEvent.change(screen.getByPlaceholderText("Prenom"), { target: { value: "Alicia" } });
    fireEvent.click(screen.getByRole("button", { name: /sauvegarder le profil/i }));

    await waitFor(() => {
      expect(screen.getByText(/profil mis a jour avec succes/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Ancien mot de passe"), { target: { value: "OldPassword123!" } });
    fireEvent.change(screen.getByPlaceholderText("Nouveau mot de passe"), { target: { value: "NewPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: /mettre a jour le mot de passe/i }));

    await waitFor(() => {
      expect(screen.getByText(/mot de passe mis a jour avec succes/i)).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
