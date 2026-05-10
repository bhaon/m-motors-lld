import { fireEvent, render, screen } from "@testing-library/react";
import AdminError from "@/app/admin/error";
import BackofficeError from "@/app/backoffice/error";
import MesDossiersError from "@/app/mes-dossiers/error";

describe("Error boundaries Next.js", () => {
  const err = Object.assign(new Error("boom"), { digest: "d1" });

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("AdminError affiche le message et appelle reset", () => {
    const reset = jest.fn();
    render(<AdminError error={err} reset={reset} />);
    expect(screen.getByText(/erreur administration/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("BackofficeError affiche le message et contient un lien accueil", () => {
    const reset = jest.fn();
    render(<BackofficeError error={err} reset={reset} />);
    expect(screen.getByText(/erreur back-office/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /accueil/i })).toHaveAttribute("href", "/");
  });

  it("MesDossiersError affiche le titre et un lien vers la liste", () => {
    const reset = jest.fn();
    render(<MesDossiersError error={err} reset={reset} />);
    expect(screen.getByText(/impossible de charger votre dossier/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mes dossiers/i })).toHaveAttribute("href", "/mes-dossiers");
  });
});
