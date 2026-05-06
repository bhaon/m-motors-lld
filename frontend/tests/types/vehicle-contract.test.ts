import type { ContratType, Filters, Vehicle } from "@/types";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

const MOTEURS: Vehicle["moteur"][] = [
  "Essence",
  "Diesel",
  "Hybride",
  "Électrique",
];
const CONTRAT_TYPES: ContratType[] = ["all", "achat", "lld"];

/**
 * Lève si l'objet ne respecte pas la forme runtime attendue pour une option.
 */
function assertVehicleOption(x: unknown): void {
  if (typeof x !== "object" || x === null) throw new Error("option invalide");
  const o = x as Record<string, unknown>;
  if (typeof o.n !== "string" || typeof o.p !== "string")
    throw new Error("option n/p");
}

/**
 * Lève si l'objet ne respecte pas la forme runtime attendue pour specs.
 */
function assertVehicleSpecs(x: unknown): void {
  if (typeof x !== "object" || x === null) throw new Error("specs invalides");
  const o = x as Record<string, unknown>;
  if (typeof o.carburant !== "string") throw new Error("carburant");
  if (typeof o.boite !== "string") throw new Error("boite");
  if (typeof o.couleur !== "string") throw new Error("couleur");
  if (typeof o.places !== "number") throw new Error("places");
  if (typeof o.puissance !== "string") throw new Error("puissance");
}

/**
 * Lève si la valeur n'est pas un véhicule au sens métier (aligné sur l'interface Vehicle).
 */
function assertVehicle(v: unknown): void {
  if (typeof v !== "object" || v === null) throw new Error("véhicule attendu");
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "number") throw new Error("id");
  if (typeof o.make !== "string" || typeof o.model !== "string")
    throw new Error("make/model");
  if (typeof o.year !== "number" || typeof o.km !== "number")
    throw new Error("year/km");
  if (!MOTEURS.includes(o.moteur as Vehicle["moteur"]))
    throw new Error("moteur");
  if (typeof o.prix !== "number") throw new Error("prix");
  if (typeof o.lld !== "boolean") throw new Error("lld");
  if (o.mensualite !== null && typeof o.mensualite !== "number")
    throw new Error("mensualite");
  if (typeof o.img !== "string") throw new Error("img");
  if (!Array.isArray(o.options)) throw new Error("options");
  o.options.forEach(assertVehicleOption);
  assertVehicleSpecs(o.specs);
}

describe("types / contrat runtime", () => {
  it("chaque entrée de l’échantillon de test respecte la forme Vehicle", () => {
    for (const v of SAMPLE_VEHICLES) {
      assertVehicle(v);
    }
  });

  it("accepte un objet Filters minimal compatible avec useFilters", () => {
    const f: Filters = {
      marque: "",
      modele: "",
      moteur: "",
      kmMax: null,
      prixMax: null,
      type: "all",
    };
    expect(CONTRAT_TYPES).toContain(f.type);
    expect(f.kmMax).toBeNull();
  });
});
