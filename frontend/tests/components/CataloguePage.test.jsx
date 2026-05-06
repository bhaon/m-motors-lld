import { fireEvent, render, screen } from "@testing-library/react";
import CataloguePage from "@/components/CataloguePage";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("CataloguePage", () => {
  it("affiche le message catalogue vide (installation sans seed)", () => {
    render(<CataloguePage vehicles={[]} />);
    expect(screen.getByText("Catalogue vide")).toBeInTheDocument();
    expect(screen.getByText(/python scripts\/seed\.py/i)).toBeInTheDocument();
  });

  it("affiche les cartes et ouvre la fiche au clic", () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });

  it("déclenche le toast après dépôt de dossier", () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier LLD"));

    expect(screen.getByText(/Dossier LLD initié/i)).toBeInTheDocument();
  });

  it("met à jour les filtres via la barre de recherche", () => {
    render(<CataloguePage vehicles={SAMPLE_VEHICLES} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "Peugeot" },
    });
    expect(screen.getAllByText("Peugeot").length).toBeGreaterThan(0);
  });

  it("ferme la modale via le bouton Fermer", () => {
    const v = SAMPLE_VEHICLES[0];
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(
      screen.queryByRole("button", { name: "Fermer" }),
    ).not.toBeInTheDocument();
  });

  it("déclenche le toast pour un dossier achat (véhicule sans LLD)", () => {
    const v = SAMPLE_VEHICLES.find((x) => !x.lld);
    expect(v).toBeDefined();
    render(<CataloguePage vehicles={[v]} />);

    fireEvent.click(document.querySelector(".vehicle-card"));
    fireEvent.click(screen.getByText("Déposer un dossier Achat"));

    expect(screen.getByText(/Dossier ACHAT initié/i)).toBeInTheDocument();
  });

  it("réinitialise les filtres depuis la ligne de chips", () => {
    render(<CataloguePage vehicles={SAMPLE_VEHICLES} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "Peugeot" },
    });
    fireEvent.click(screen.getByText("Réinitialiser les filtres"));
    expect(
      screen.getByText(`${SAMPLE_VEHICLES.length} véhicules`),
    ).toBeInTheDocument();
  });

  it("exécute le callback Rechercher de la barre de recherche", () => {
    render(<CataloguePage vehicles={SAMPLE_VEHICLES} />);
    fireEvent.click(screen.getByRole("button", { name: /Rechercher/i }));
  });
});
