"use client";

import { useState, useMemo } from "react";
import { Filters, ContratType, Vehicle } from "@/types";

const DEFAULT_FILTERS: Filters = {
  marque: "",
  modele: "",
  moteur: "",
  kmMax: null,
  prixMax: null,
  type: "all",
};

/**
 * Filtre une liste de véhicules fournie par le parent (données API).
 */
export function useFilters(sourceVehicles: Vehicle[]) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const marques = useMemo(
    () =>
      [...new Set(sourceVehicles.map((v) => v.make))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [sourceVehicles],
  );

  const modeles = useMemo(
    () =>
      [
        ...new Set(
          sourceVehicles
            .filter((v) => !filters.marque || v.make === filters.marque)
            .map((v) => v.model),
        ),
      ].sort((a, b) => a.localeCompare(b)),

    [filters.marque, sourceVehicles],
  );

  const filtered = useMemo(() => {
    return sourceVehicles.filter((v) => {
      if (filters.marque && v.make !== filters.marque) return false;
      if (filters.modele && v.model !== filters.modele) return false;
      if (filters.moteur && v.moteur !== filters.moteur) return false;
      if (filters.kmMax !== null && v.km > filters.kmMax) return false;
      if (filters.prixMax !== null && v.prix > filters.prixMax) return false;
      if (filters.type === "achat" && v.lld) return false;
      if (filters.type === "lld" && !v.lld) return false;
      return true;
    });
  }, [filters, sourceVehicles]);

  const setType = (type: ContratType) => setFilters((f) => ({ ...f, type }));

  const setField = (field: keyof Filters, value: string | number | null) =>
    setFilters((f) => ({
      ...f,
      [field]: value,
      ...(field === "marque" ? { modele: "" } : {}),
    }));

  const reset = () => setFilters(DEFAULT_FILTERS);

  return { filters, filtered, marques, modeles, setType, setField, reset };
}
