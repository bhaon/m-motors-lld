import { act, renderHook } from "@testing-library/react";
import { useFilters } from "@/hooks/useFilters";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("useFilters", () => {
  it("retourne les marques triées et uniques", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));
    const expected = [...new Set(SAMPLE_VEHICLES.map((v) => v.make))].sort(
      (a, b) => a.localeCompare(b),
    );

    expect(result.current.marques).toEqual(expected);
  });

  it("filtre les véhicules par marque et réinitialise le modèle", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setField("modele", "Test");
      result.current.setField("marque", "Peugeot");
    });

    expect(result.current.filters.modele).toBe("");
    expect(result.current.filtered.every((v) => v.make === "Peugeot")).toBe(
      true,
    );
  });

  it("filtre par type lld uniquement", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setType("lld");
    });

    expect(result.current.filtered.length).toBeGreaterThan(0);
    expect(result.current.filtered.every((v) => v.lld)).toBe(true);
  });

  it("filtre par type achat uniquement", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setType("achat");
    });

    expect(result.current.filtered.length).toBeGreaterThan(0);
    expect(result.current.filtered.every((v) => !v.lld)).toBe(true);
  });

  it("filtre par km max et prix max", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setField("kmMax", 50000);
      result.current.setField("prixMax", 20000);
    });

    expect(result.current.filtered.every((v) => v.km <= 50000)).toBe(true);
    expect(result.current.filtered.every((v) => v.prix <= 20000)).toBe(true);
  });

  it("réinitialise les filtres", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setField("marque", "Peugeot");
      result.current.reset();
    });

    expect(result.current.filters.marque).toBe("");
    expect(result.current.filtered.length).toBe(SAMPLE_VEHICLES.length);
  });

  it("filtre par motorisation", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setField("moteur", "Diesel");
    });

    expect(result.current.filtered.every((v) => v.moteur === "Diesel")).toBe(
      true,
    );
  });

  it("filtre par modèle lorsque la marque est fixée", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setField("marque", "Peugeot");
      result.current.setField("modele", "308 SW");
    });

    expect(result.current.filtered.length).toBeGreaterThan(0);
    expect(result.current.filtered.every((v) => v.model === "308 SW")).toBe(
      true,
    );
  });

  it("exclut tout si le modèle ne correspond à aucun véhicule", () => {
    const { result } = renderHook(() => useFilters(SAMPLE_VEHICLES));

    act(() => {
      result.current.setField("marque", "Peugeot");
      result.current.setField("modele", "ModèleInexistant");
    });

    expect(result.current.filtered).toEqual([]);
  });

  it("accepte une liste source personnalisée", () => {
    const subset = SAMPLE_VEHICLES.filter((v) => v.make === "Toyota");
    const { result } = renderHook(() => useFilters(subset));

    expect(result.current.marques).toEqual(["Toyota"]);
    expect(result.current.filtered.length).toBe(subset.length);
  });

  it("gère une liste source vide", () => {
    const { result } = renderHook(() => useFilters([]));

    expect(result.current.marques).toEqual([]);
    expect(result.current.modeles).toEqual([]);
    expect(result.current.filtered).toEqual([]);
  });
});
