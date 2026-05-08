import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUtilisateursPage from "@/app/admin/utilisateurs/page";

const ADMIN_USER = {
  id: 1,
  email: "admin@mmotors.fr",
  first_name: "Admin",
  last_name: "M-Motors",
  role: "admin",
  is_active: true,
  email_verified: true,
  created_at: "2026-01-01T10:00:00Z",
};

const SUPERVISEUR_USER = {
  id: 2,
  email: "sophie.martin@mmotors.fr",
  first_name: "Sophie",
  last_name: "Martin",
  role: "superviseur",
  is_active: true,
  email_verified: true,
  created_at: "2026-02-15T09:00:00Z",
};

const CLIENT_USER = {
  id: 3,
  email: "jean.dupont@example.com",
  first_name: "Jean",
  last_name: "Dupont",
  role: "client",
  is_active: true,
  email_verified: false,
  created_at: "2026-03-10T08:00:00Z",
};

const USER_LIST = [ADMIN_USER, SUPERVISEUR_USER, CLIENT_USER];

describe("AdminUtilisateursPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Chargement et affichage ─────────────────────────────────────────────────

  it("affiche le titre de la page", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(screen.getByText(/gestion des utilisateurs/i)).toBeInTheDocument();
    });
  });

  it("appelle GET /api/v1/admin/users au chargement", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/users"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("affiche la liste des utilisateurs avec nom, email et rôle", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => USER_LIST } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(screen.getByText("Sophie Martin")).toBeInTheDocument();
      expect(screen.getByText("sophie.martin@mmotors.fr")).toBeInTheDocument();
      // "Superviseur" apparaît plusieurs fois (badge + options select) — getAllByText
      expect(screen.getAllByText("Superviseur").length).toBeGreaterThan(0);
    });
  });

  it("affiche les badges colorés pour chaque rôle présent", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => USER_LIST } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      // Les libellés de rôles peuvent apparaître plusieurs fois (badge + compteur + options)
      expect(screen.getAllByText("Administrateur").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Superviseur").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Client").length).toBeGreaterThan(0);
    });
  });

  it("affiche les compteurs par rôle", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => USER_LIST } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument(); // Total
    });
  });

  it("affiche l'état vide quand aucun utilisateur n'existe", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(screen.getByText(/aucun utilisateur/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si le chargement échoue", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Non autorisé." }),
    } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain("Non autorisé.");
    });
  });

  // ── Formulaire de création ──────────────────────────────────────────────────

  it("affiche le bouton 'Nouvel utilisateur'", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /nouvel utilisateur/i })).toBeInTheDocument();
    });
  });

  it("ouvre le formulaire de création au clic", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));
    await waitFor(() => {
      expect(screen.getByTestId("create-user-form")).toBeInTheDocument();
      const form = screen.getAllByTestId("create-user-form").at(-1)!;
      expect(within(form).getByTestId("field-firstname")).toBeInTheDocument();
      expect(within(form).getByTestId("field-lastname")).toBeInTheDocument();
      expect(within(form).getByTestId("field-email")).toBeInTheDocument();
      expect(within(form).getByTestId("field-password")).toBeInTheDocument();
      expect(within(form).getByLabelText("Rôle *")).toBeInTheDocument();
    });
  });

  it("crée un utilisateur et affiche le message de succès", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 99,
          email: "new.sup@example.com",
          role: "superviseur",
          message: "Compte superviseur créé avec succès.",
        }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => [] } as Response);

    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));

    await waitFor(() => screen.getByTestId("create-user-form"));
    const form = screen.getAllByTestId("create-user-form").at(-1)!;
    fireEvent.change(within(form).getByTestId("field-firstname"), { target: { value: "Sophie" } });
    fireEvent.change(within(form).getByTestId("field-lastname"), { target: { value: "Martin" } });
    fireEvent.change(within(form).getByTestId("field-email"), { target: { value: "new.sup@example.com" } });
    fireEvent.change(within(form).getByTestId("field-password"), { target: { value: "Sup3rS3cur!" } });
    fireEvent.click(screen.getByRole("button", { name: /créer le compte/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/users"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText(/superviseur créé avec succès/i)).toBeInTheDocument();
    });
  });

  it("affiche les erreurs de validation si le formulaire est soumis vide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByRole("button", { name: /créer le compte/i }));
    await waitFor(() => {
      expect(screen.getByText(/prénom obligatoire/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si l'email est déjà utilisé (409)", async () => {
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Un compte existe déjà avec cet email." }),
      } as Response);

    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /nouvel utilisateur/i }));
    fireEvent.click(screen.getByRole("button", { name: /nouvel utilisateur/i }));

    await waitFor(() => screen.getByTestId("create-user-form"));
    const form409 = screen.getAllByTestId("create-user-form").at(-1)!;
    fireEvent.change(within(form409).getByTestId("field-firstname"), { target: { value: "Test" } });
    fireEvent.change(within(form409).getByTestId("field-lastname"), { target: { value: "Dup" } });
    fireEvent.change(within(form409).getByTestId("field-email"), { target: { value: "dup@example.com" } });
    fireEvent.change(within(form409).getByTestId("field-password"), { target: { value: "Dup3rS3cur!" } });
    fireEvent.click(screen.getByRole("button", { name: /créer le compte/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert").textContent).toContain("Un compte existe déjà");
    });
  });

  // ── Suppression ─────────────────────────────────────────────────────────────

  it("affiche le bouton Supprimer pour chaque utilisateur", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => USER_LIST } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /supprimer/i });
      expect(buttons.length).toBe(USER_LIST.length);
    });
  });

  it("demande une confirmation avant suppression", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [CLIENT_USER] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /supprimer jean dupont/i }));

    fireEvent.click(screen.getByRole("button", { name: /supprimer jean dupont/i }));

    await waitFor(() => {
      expect(screen.getByText(/confirmer/i)).toBeInTheDocument();
      // Le bouton "Oui" a un aria-label "Confirmer la suppression de..." qui écrase "Oui"
      expect(screen.getByText("Oui")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /non/i })).toBeInTheDocument();
    });
  });

  it("annule la suppression avec 'Non'", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [CLIENT_USER] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /supprimer jean dupont/i }));

    fireEvent.click(screen.getByRole("button", { name: /supprimer jean dupont/i }));
    await waitFor(() => screen.getByText("Oui"));
    fireEvent.click(screen.getByRole("button", { name: /non/i }));

    await waitFor(() => {
      expect(screen.queryByText(/confirmer/i)).not.toBeInTheDocument();
    });
  });

  it("appelle DELETE et retire l'utilisateur de la liste après confirmation", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [CLIENT_USER] } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response);

    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("button", { name: /supprimer jean dupont/i }));

    fireEvent.click(screen.getByRole("button", { name: /supprimer jean dupont/i }));
    await waitFor(() => screen.getByText("Oui"));
    fireEvent.click(screen.getByRole("button", { name: /confirmer la suppression de jean dupont/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/admin/users/${CLIENT_USER.id}`),
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByText("jean.dupont@example.com")).not.toBeInTheDocument();
    });
  });

  // ── Changement de rôle ──────────────────────────────────────────────────────

  it("affiche un select de rôle pour chaque utilisateur", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [SUPERVISEUR_USER] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => {
      const roleSelect = screen.getByRole("combobox", { name: /changer le rôle de sophie martin/i });
      expect(roleSelect).toBeInTheDocument();
    });
  });

  it("affiche le bouton Enregistrer quand un rôle différent est sélectionné", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [SUPERVISEUR_USER] } as Response);
    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("combobox", { name: /changer le rôle de sophie martin/i }));

    fireEvent.change(
      screen.getByRole("combobox", { name: /changer le rôle de sophie martin/i }),
      { target: { value: "gestionnaire" } },
    );

    expect(screen.getByRole("button", { name: /enregistrer le nouveau rôle de sophie martin/i })).toBeInTheDocument();
  });

  it("enregistre le nouveau rôle via PATCH", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [SUPERVISEUR_USER] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Rôle mis à jour.", user_id: 2, new_role: "gestionnaire" }),
      } as Response);

    render(<AdminUtilisateursPage />);
    await waitFor(() => screen.getByRole("combobox", { name: /changer le rôle de sophie martin/i }));

    fireEvent.change(
      screen.getByRole("combobox", { name: /changer le rôle de sophie martin/i }),
      { target: { value: "gestionnaire" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /enregistrer le nouveau rôle de sophie martin/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/admin/users/${SUPERVISEUR_USER.id}/role`),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});
