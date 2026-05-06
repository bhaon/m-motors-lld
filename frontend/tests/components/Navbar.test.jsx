import { render, screen, waitFor } from "@testing-library/react";
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

  it("affiche la pastille utilisateur quand l'utilisateur est connecté", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true });
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /accéder à mon espace client/i })).toHaveAttribute("href", "/espace-client");
    });
  });
});
