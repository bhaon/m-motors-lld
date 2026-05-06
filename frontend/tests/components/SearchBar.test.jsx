import { fireEvent, render, screen } from "@testing-library/react";
import SearchBar from "@/components/SearchBar";

describe("SearchBar", () => {
  it("déclenche onField et onSearch avec les bonnes valeurs", () => {
    const onField = jest.fn();
    const onSearch = jest.fn();

    render(
      <SearchBar
        marques={["Renault"]}
        modeles={["Clio V"]}
        marque=""
        modele=""
        moteur=""
        kmMax={null}
        prixMax={null}
        onField={onField}
        onSearch={onSearch}
      />,
    );

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "Renault" },
    });
    expect(onField).toHaveBeenCalledWith("marque", "Renault");

    fireEvent.change(screen.getByPlaceholderText("Ex: 25000"), {
      target: { value: "25000" },
    });
    expect(onField).toHaveBeenCalledWith("prixMax", 25000);

    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("déclenche onField pour modèle, motorisation et km max", () => {
    const onField = jest.fn();
    const selects = () => screen.getAllByRole("combobox");

    render(
      <SearchBar
        marques={["Renault"]}
        modeles={["Clio V"]}
        marque="Renault"
        modele=""
        moteur=""
        kmMax={null}
        prixMax={null}
        onField={onField}
        onSearch={jest.fn()}
      />,
    );

    fireEvent.change(selects()[1], { target: { value: "Clio V" } });
    expect(onField).toHaveBeenCalledWith("modele", "Clio V");

    fireEvent.change(selects()[2], { target: { value: "Diesel" } });
    expect(onField).toHaveBeenCalledWith("moteur", "Diesel");

    fireEvent.change(selects()[3], { target: { value: "30000" } });
    expect(onField).toHaveBeenCalledWith("kmMax", 30000);

    fireEvent.change(selects()[3], { target: { value: "" } });
    expect(onField).toHaveBeenCalledWith("kmMax", null);
  });

  it("vide le budget max lorsque le champ est effacé", () => {
    const onField = jest.fn();
    render(
      <SearchBar
        marques={["Renault"]}
        modeles={["Clio V"]}
        marque=""
        modele=""
        moteur=""
        kmMax={null}
        prixMax={25000}
        onField={onField}
        onSearch={jest.fn()}
      />,
    );

    const budget = screen.getByPlaceholderText("Ex: 25000");
    fireEvent.change(budget, { target: { value: "" } });
    expect(onField).toHaveBeenCalledWith("prixMax", null);
  });
});
