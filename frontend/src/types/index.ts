/** Option LLD d'un véhicule (nom court `n`, prix formaté `p`). */
export interface VehicleOption {
  /** Nom de l'option (ex : "GPS intégré"). */
  n: string;
  /** Prix mensuel formaté (ex : "+30€/mois"). */
  p: string;
}

/** Caractéristiques techniques affichées dans la fiche véhicule. */
export interface VehicleSpecs {
  carburant: string;
  boite: string;
  couleur: string;
  places: number;
  puissance: string;
}

/**
 * Représentation d'un véhicule telle que retournée par l'API publique (`VehicleOut`).
 * `img` contient l'URL de la photo principale — mise à jour côté back-office
 * dès qu'une nouvelle photo principale est définie.
 */
export interface Vehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  km: number;
  moteur: "Essence" | "Diesel" | "Hybride" | "Électrique";
  prix: number;
  lld: boolean;
  /** null si le véhicule n'est pas en LLD. */
  mensualite: number | null;
  options: VehicleOption[];
  img: string;
  specs: VehicleSpecs;
}

/** Filtre actif sur le catalogue — "all" désactive le filtre type de contrat. */
export type ContratType = "all" | "achat" | "lld";

/**
 * Cycle de vie d'un dossier client :
 * brouillon → depose → en_instruction → en_signature → attente_livraison → livraison_planifiee | rejete | annule
 * (le statut « valide » peut subsister sur d'anciennes données.)
 */
export type DossierStatus =
  | "brouillon"
  | "depose"
  | "en_instruction"
  | "valide"
  | "en_signature"
  | "attente_livraison"
  | "livraison_planifiee"
  | "contrat_en_cours"
  | "cloture"
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

// ── US-04-04 : Contrats LLD ───────────────────────────────────────────────────

export interface ContratVehicle {
  make: string;
  model: string;
  year: number;
  mensualite: number | null;
}

export interface ContratListItem {
  id: number;
  reference: string;
  vehicle_id: number;
  vehicle: ContratVehicle;
  duree_mois: number | null;
  date_debut: string | null;
  date_fin: string | null;
  is_active: boolean;
  /** Base véhicule + options cochées (HT), aligné sur le détail dossier LLD (US-06-08). */
  total_mensualite_ht?: number | null;
}
