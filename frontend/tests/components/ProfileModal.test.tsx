import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileModal from "@/components/ProfileModal";

describe("ProfileModal", () => {
  const onClose = jest.fn();
  const onProfileUpdated = jest.fn();

  beforeEach(() => {
    jest.restoreAllMocks();
    onClose.mockClear();
    onProfileUpdated.mockClear();
  });

  it("ne rend rien lorsque la modale est fermee", () => {
    const { container } = render(
      <ProfileModal open={false} onClose={onClose} onProfileUpdated={onProfileUpdated} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("charge le profil puis affiche le formulaire", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 2,
        email: "modal@example.com",
        role: "client",
        first_name: "Bob",
        last_name: "Durand",
        phone: null,
        email_verified: true,
      }),
    } as Response);

    render(<ProfileModal open onClose={onClose} onProfileUpdated={onProfileUpdated} />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Prenom")).toHaveValue("Bob");
    });
  });

  it("affiche une erreur et ferme la modale si la session est invalide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    render(<ProfileModal open onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/session expirée/i)).toBeInTheDocument();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("affiche une erreur reseau si fetch echoue", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));

    render(<ProfileModal open onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/erreur réseau/i)).toBeInTheDocument();
    });
  });

  it("ferme la modale au clic sur le fond", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "x@example.com",
        role: "client",
        first_name: "A",
        last_name: "B",
        phone: null,
        email_verified: true,
      }),
    } as Response);

    const { container } = render(<ProfileModal open onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const backdrop = container.querySelector('[role="presentation"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it("ferme la modale avec le bouton fermer", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "x@example.com",
        role: "client",
        first_name: "A",
        last_name: "B",
        phone: null,
        email_verified: true,
      }),
    } as Response);

    render(<ProfileModal open onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /fermer/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ferme la modale avec la touche Escape", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "x@example.com",
        role: "client",
        first_name: "A",
        last_name: "B",
        phone: null,
        email_verified: true,
      }),
    } as Response);

    render(<ProfileModal open onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
