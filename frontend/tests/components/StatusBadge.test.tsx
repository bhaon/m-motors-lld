import { render, screen } from "@testing-library/react";
import StatusBadge from "@/components/StatusBadge";
import type { DossierStatus } from "@/types";

describe("StatusBadge", () => {
  it.each<[DossierStatus, string]>([
    ["brouillon",          "Brouillon"],
    ["depose",             "Déposé"],
    ["en_instruction",     "En instruction"],
    ["valide",             "Validé"],
    ["en_signature",       "En signature"],
    ["attente_livraison",  "Attente de livraison"],
    ["livraison_planifiee", "Livraison planifiée"],
    ["cloture", "Clôturé"],
    ["rejete",             "Rejeté"],
    ["annule",             "Annulé"],
  ])("affiche le bon libellé français pour le statut « %s »", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("expose un rôle status accessible", () => {
    render(<StatusBadge status="valide" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("l'aria-label contient le libellé lisible", () => {
    render(<StatusBadge status="en_instruction" />);
    expect(
      screen.getByRole("status", { name: /en instruction/i })
    ).toBeInTheDocument();
  });

  it("applique une couleur de fond différente selon le statut", () => {
    const { rerender } = render(<StatusBadge status="valide" />);
    const valide = screen.getByRole("status");
    const bgValide = (valide as HTMLElement).style.background;

    rerender(<StatusBadge status="rejete" />);
    const rejete = screen.getByRole("status");
    const bgRejete = (rejete as HTMLElement).style.background;

    expect(bgValide).not.toBe(bgRejete);
  });

  it("affiche le statut brut si la valeur n'est pas reconnue (fallback)", () => {
    render(<StatusBadge status={"inconnu_statut" as DossierStatus} />);
    expect(screen.getByText("inconnu_statut")).toBeInTheDocument();
  });
});