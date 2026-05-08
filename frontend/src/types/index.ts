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

export type DossierStatus =
  | "brouillon"
  | "depose"
  | "en_instruction"
  | "valide"
  | "rejete"
  | "annule";

export type DossierType = "achat" | "lld";

export interface DossierVehicle {
  make: string;
  model: string;
  year: number;
}

export interface DossierListItem {
  id: number;
  reference: string;
  type: DossierType;
  status: DossierStatus;
  vehicle_id: number;
  client_id: number;
  created_at: string | null;
  vehicle: DossierVehicle;
}

export interface Filters {
  marque: string;
  modele: string;
  moteur: string;
  kmMax: number | null;
  prixMax: number | null;
  type: ContratType;
}
