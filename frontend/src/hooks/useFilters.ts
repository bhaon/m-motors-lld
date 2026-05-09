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
 * Gère les filtres du catalogue véhicules côté client.
 *
 * Tous les filtrages sont réalisés en mémoire sur la liste fournie par le serveur,
 * ce qui évite un aller-retour API à chaque changement de filtre.
 *
 * @param sourceVehicles - Liste complète venue de l'API (non filtrée).
 */
export function useFilters(sourceVehicles: Vehicle[]) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  /** Liste dédupliquée et triée des marques disponibles dans le catalogue courant. */
  const marques = useMemo(
    () =>
      [...new Set(sourceVehicles.map((v) => v.make))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [sourceVehicles],
  );

  /**
   * Modèles disponibles pour la marque sélectionnée (ou tous si aucune marque).
   * Recalculé à chaque changement de `filters.marque` pour rester cohérent.
   */
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

  /** Sous-ensemble de véhicules correspondant à tous les critères actifs. */
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

  /**
   * Met à jour un champ de filtre.
   * Si le champ est `marque`, réinitialise `modele` pour éviter une valeur orpheline
   * (ex : "Clio" n'existe pas chez Peugeot).
   */
  const setField = (field: keyof Filters, value: string | number | null) =>
    setFilters((f) => ({
      ...f,
      [field]: value,
      ...(field === "marque" ? { modele: "" } : {}),
    }));

  const reset = () => setFilters(DEFAULT_FILTERS);

  return { filters, filtered, marques, modeles, setType, setField, reset };
}
