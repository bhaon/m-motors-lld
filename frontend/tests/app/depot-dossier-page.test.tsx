import { render, screen } from "@testing-library/react";
import DepotDossierPage from "@/app/espace-client/dossiers/[dossierId]/depot/page";

jest.mock("@/components/Navbar", () => ({
  __esModule: true,
  default: () => <div>Navbar</div>,
}));

describe("DepotDossierPage", () => {
  it("pré-sélectionne le type LLD reçu depuis la fiche véhicule", async () => {
    const tree = await DepotDossierPage({
      params: Promise.resolve({ dossierId: "42" }),
      searchParams: Promise.resolve({ type: "lld", ref: "DOS-2026-00042" }),
    });
    render(tree);

    expect(screen.getByText("Référence:")).toBeInTheDocument();
    expect(screen.getByText("DOS-2026-00042")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type de dossier" })).toHaveValue(
      "lld",
    );
  });

  it("retombe sur Achat quand le type est absent", async () => {
    const tree = await DepotDossierPage({
      params: Promise.resolve({ dossierId: "77" }),
      searchParams: Promise.resolve({}),
    });
    render(tree);

    expect(screen.getByRole("combobox", { name: "Type de dossier" })).toHaveValue(
      "achat",
    );
  });
});
