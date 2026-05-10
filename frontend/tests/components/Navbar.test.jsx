import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Navbar from "@/components/Navbar";

describe("Navbar", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("affiche la marque et le lien catalogue", () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false });
    render(<Navbar />);
    expect(screen.getByText(/M-/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catalogue" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("affiche Connexion sans lien inscription lorsque la session est absente", () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false });
    render(<Navbar />);
    expect(screen.getByRole("button", { name: /^Connexion$/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /inscription/i })).not.toBeInTheDocument();
  });

  it("affiche la pastille utilisateur quand l'utilisateur est connecté", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "Jean",
        last_name: "Durand",
        role: "client",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));
    expect(screen.getByRole("menu", { name: /menu utilisateur/i })).toBeInTheDocument();
    const profileItem = screen.getByRole("menuitem", { name: "Profile" });
    const dossiersItem = screen.getByRole("menuitem", { name: "Mes dossiers" });
    expect(screen.getByRole("menuitem", { name: "Mes contrats" })).toHaveAttribute(
      "href",
      "/mes-contrats",
    );
    expect(profileItem.tagName).toBe("BUTTON");
    expect(dossiersItem).toHaveAttribute("href", "/mes-dossiers");
    expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeInTheDocument();
  });

  it("garde l'initiale par défaut si /me ne renvoie pas de JSON", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toHaveTextContent("U");
  });

  it("ferme le menu au clic extérieur et via Escape", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "Jean",
        last_name: "Durand",
        role: "client",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });

    const opener = screen.getByRole("button", { name: /ouvrir le menu utilisateur/i });
    fireEvent.click(opener);
    expect(screen.getByRole("menu", { name: /menu utilisateur/i })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: /menu utilisateur/i })).not.toBeInTheDocument();
    });

    fireEvent.click(opener);
    expect(screen.getByRole("menu", { name: /menu utilisateur/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: /menu utilisateur/i })).not.toBeInTheDocument();
    });
  });

  it("déconnecte l'utilisateur et redirige vers l'accueil", async () => {
    process.env.NODE_ENV = "production";
    const fetchSpy = jest
      .spyOn(global, "fetch")
      // /me
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          first_name: "Jean",
          last_name: "Durand",
          role: "client",
        }),
      })
      // /logout
      .mockResolvedValueOnce({ ok: true });

    const assignSpy = jest.spyOn(window.location, "assign").mockImplementation(() => {});

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Déconnexion" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(assignSpy).toHaveBeenCalledWith("/");
    });
  });

  it("ne montre pas la pastille si /me renvoie 401", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false });
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /ouvrir le menu utilisateur/i })).not.toBeInTheDocument();
    });
  });

  it("ne montre pas la pastille si l'appel /me échoue", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    render(<Navbar />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /ouvrir le menu utilisateur/i })).not.toBeInTheDocument();
    });
  });

  it("ferme le menu après clic sur Profile", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "Jean",
        last_name: "Durand",
        role: "client",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));
    expect(screen.getByRole("menu", { name: /menu utilisateur/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: /menu utilisateur/i })).not.toBeInTheDocument();
    });
  });

  it("ferme le menu après clic sur Mes dossiers", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "Jean",
        last_name: "Durand",
        role: "client",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));
    expect(screen.getByRole("menuitem", { name: "Mes dossiers" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Mes dossiers" }));
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: /menu utilisateur/i })).not.toBeInTheDocument();
    });
  });

  it("affiche les liens back-office gestionnaire mais pas le reporting", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "G",
        last_name: "estion",
        role: "gestionnaire",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));

    expect(screen.getByRole("menuitem", { name: /gestion véhicules/i })).toHaveAttribute(
      "href",
      "/backoffice/vehicules",
    );
    expect(screen.getByRole("menuitem", { name: /dossiers en attente/i })).toHaveAttribute(
      "href",
      "/backoffice/dossiers",
    );
    expect(screen.queryByRole("menuitem", { name: /reporting dossiers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mes dossiers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mes contrats" })).not.toBeInTheDocument();
  });

  it("affiche le lien Reporting dossiers pour un superviseur", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "S",
        last_name: "up",
        role: "superviseur",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));

    expect(screen.getByRole("menuitem", { name: /reporting dossiers/i })).toHaveAttribute(
      "href",
      "/backoffice/reporting",
    );
  });

  it("affiche Reporting dossiers pour un admin", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        first_name: "A",
        last_name: "dm",
        role: "admin",
      }),
    });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /ouvrir le menu utilisateur/i }));

    expect(screen.getByRole("menuitem", { name: /reporting dossiers/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /administration/i })).toBeInTheDocument();
  });
});
