export interface VehicleOption {
  n: string;
  p: string;
}

export interface VehicleSpecs {
  carburant: string;
  boite: string;
  couleur: string;
  places: number;
  puissance: string;
}

export interface Vehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  km: number;
  moteur: "Essence" | "Diesel" | "Hybride" | "Électrique";
  prix: number;
  lld: boolean;
  mensualite: number | null;
  options: VehicleOption[];
  img: string;
  specs: VehicleSpecs;
}

export type ContratType = "all" | "achat" | "lld";

export interface Filters {
  marque: string;
  modele: string;
  moteur: string;
  kmMax: number | null;
  prixMax: number | null;
  type: ContratType;
}
