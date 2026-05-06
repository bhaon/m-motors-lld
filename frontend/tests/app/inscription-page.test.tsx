import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InscriptionPage from "@/app/inscription/page";

describe("InscriptionPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("envoie le formulaire et affiche un message de confirmation", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Inscription reussie. Verifiez votre email." }),
    } as Response);

    render(<InscriptionPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "new.user@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
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

  it("affiche une erreur si l'API renvoie un echec", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Un compte existe deja avec cet email." }),
    } as Response);

    render(<InscriptionPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "existing@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), {
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
});
