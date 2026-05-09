"use client";

/**
 * Formulaire de création / édition d'un véhicule — partagé entre :
 * - La modale du tableau de bord back-office (`backoffice/vehicules/page.tsx`).
 * - La page de création autonome (`backoffice/vehicules/nouveau/page.tsx`).
 */

import { useState } from "react";
import Image from "next/image";
import { apiUrl } from "@/lib/api";

// ── Types exportés (réutilisés dans les pages consommatrices) ─────────────────

export type VehicleMoteur = "Essence" | "Diesel" | "Hybride" | "Électrique";

/** Représentation back-office d'un véhicule (superset de VehicleOut public). */
export interface VehicleBoItem {
  id: number;
  make: string;
  model: string;
  year: number;
  km: number;
  moteur: VehicleMoteur;
  prix: number;
  lld: boolean;
  mensualite: number | null;
  img: string;
  archived: boolean;
  archived_at: string | null;
  visible_catalogue: boolean;
  specs: {
    carburant: string;
    boite: string;
    couleur: string;
    places: number;
    puissance: string;
  };
  options?: { id: number; name: string; surcharge: number }[];
}

/** État contrôlé du formulaire (tous les champs en string pour les inputs). */
export interface FormState {
  make: string;
  model: string;
  year: string;
  moteur: VehicleMoteur;
  km: string;
  prix: string;
  lld: boolean;
  mensualite: string;
  spec_couleur: string;
  spec_boite: string;
  spec_places: string;
  spec_puissance: string;
  img: string;
  visible_catalogue: boolean;
}

export const INITIAL_FORM: FormState = {
  make: "",
  model: "",
  year: "",
  moteur: "Essence",
  km: "",
  prix: "",
  lld: false,
  mensualite: "",
  spec_couleur: "",
  spec_boite: "Manuelle",
  spec_places: "5",
  spec_puissance: "",
  img: "",
  visible_catalogue: true,
};

/** Convertit un véhicule BO en état de formulaire pour le mode édition. */
export function vehicleToForm(v: VehicleBoItem): FormState {
  return {
    make: v.make,
    model: v.model,
    year: String(v.year),
    moteur: v.moteur,
    km: String(v.km),
    prix: String(v.prix),
    lld: v.lld,
    mensualite: v.mensualite != null ? String(v.mensualite) : "",
    spec_couleur: v.specs.couleur,
    spec_boite: v.specs.boite,
    spec_places: String(v.specs.places),
    spec_puissance: v.specs.puissance,
    img: v.img,
    visible_catalogue: v.visible_catalogue,
  };
}

// ── Constantes ────────────────────────────────────────────────────────────────

const MOTEURS = ["Essence", "Diesel", "Hybride", "Électrique"] as const;
const BOITES = ["Manuelle", "Automatique", "CVT"] as const;

// ── Sous-composant ────────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ color: "#b91c1c", fontSize: ".82rem", marginTop: 4 }}>
      {message}
    </p>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface VehicleFormProps {
  mode: "add" | "edit";
  initial: FormState;
  /** `reference` et `message` sont fournis uniquement en mode add (issu de POST /creer). */
  onSuccess: (vehicle: VehicleBoItem, isNew: boolean, reference?: string, message?: string) => void;
  onCancel: () => void;
  /** Requis en mode edit. */
  targetId?: number;
  /**
   * Conserve l'état d'archivage lors d'un PATCH : l'API ne le renvoie pas.
   * Sans ce snapshot le véhicule édité serait affiché avec archived=false.
   */
  archivedSnapshot?: { archived: boolean; archived_at: string | null };
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function VehicleForm({
  mode,
  initial,
  onSuccess,
  onCancel,
  targetId,
  archivedSnapshot,
}: VehicleFormProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.make.trim()) next.make = "La marque est obligatoire.";
    if (!form.model.trim()) next.model = "Le modèle est obligatoire.";
    const year = parseInt(form.year, 10);
    if (!form.year || isNaN(year) || year < 2000 || year > 2030)
      next.year = "L'année doit être comprise entre 2000 et 2030.";
    const km = parseInt(form.km, 10);
    if (!form.km || isNaN(km) || km < 0) next.km = "Le kilométrage doit être un entier positif.";
    const prix = parseFloat(form.prix);
    if (!form.prix || isNaN(prix) || prix <= 0) next.prix = "Le prix HT doit être supérieur à 0.";
    if (form.lld) {
      const mens = parseFloat(form.mensualite);
      if (!form.mensualite || isNaN(mens) || mens <= 0)
        next.mensualite = "La mensualité LLD HT est obligatoire et doit être positive.";
    }
    if (!form.spec_couleur.trim()) next.spec_couleur = "La couleur est obligatoire.";
    if (!form.spec_puissance.trim()) next.spec_puissance = "La puissance est obligatoire.";
    if (!form.img.trim()) next.img = "L'URL de la photo principale est obligatoire.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const body = {
        make: form.make.trim(),
        model: form.model.trim(),
        year: parseInt(form.year, 10),
        moteur: form.moteur,
        km: parseInt(form.km, 10),
        prix: parseFloat(form.prix),
        lld: form.lld,
        mensualite: form.lld ? parseFloat(form.mensualite) : null,
        spec_carburant: form.moteur,
        spec_boite: form.spec_boite,
        spec_couleur: form.spec_couleur.trim(),
        spec_places: parseInt(form.spec_places, 10),
        spec_puissance: form.spec_puissance.trim(),
        img: form.img.trim(),
        visible_catalogue: form.visible_catalogue,
      };

      const url =
        mode === "add"
          ? apiUrl("/api/v1/vehicules/creer")
          : apiUrl(`/api/v1/vehicules/${targetId}`);
      const method = mode === "add" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? "Erreur lors de l'enregistrement.");
      }

      const data = await res.json();
      const specs = {
        carburant: body.spec_carburant,
        boite: body.spec_boite,
        couleur: body.spec_couleur,
        places: body.spec_places,
        puissance: body.spec_puissance,
      };

      if (mode === "add") {
        // POST /creer retourne { id, reference, message } — reconstruction locale du VehicleBoItem
        const apiData = data as { id: number; reference?: string; message?: string };
        const created: VehicleBoItem = {
          id: apiData.id,
          ...body,
          mensualite: body.mensualite ?? null,
          archived: false,
          archived_at: null,
          specs,
          options: [],
        };
        onSuccess(created, true, apiData.reference, apiData.message);
      } else {
        // PATCH retourne VehicleOut sans les champs BO — on fusionne avec le snapshot
        const updated: VehicleBoItem = {
          id: targetId!,
          ...body,
          mensualite: body.mensualite ?? null,
          archived: archivedSnapshot?.archived ?? false,
          archived_at: archivedSnapshot?.archived_at ?? null,
          specs,
          options: [],
        };
        onSuccess(updated, false);
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: ".9rem",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 600,
    fontSize: ".85rem",
    color: "#374151",
    marginBottom: 4,
  };
  const groupStyle: React.CSSProperties = { marginBottom: "1rem" };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {apiError && (
        <p role="alert" style={{ color: "#b91c1c", marginBottom: "1rem", fontWeight: 600, fontSize: ".9rem" }}>
          {apiError}
        </p>
      )}

      {/* ── Identité ──────────────────────────────────────────────────────── */}
      <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
        <legend style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", padding: "0 6px" }}>
          Identité du véhicule
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <div style={groupStyle}>
            <label htmlFor="vf-make" style={labelStyle}>Marque *</label>
            <input id="vf-make" type="text" value={form.make} onChange={(e) => setField("make", e.target.value)} placeholder="ex : Renault" style={inputStyle} />
            <FieldError message={errors.make} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-model" style={labelStyle}>Modèle *</label>
            <input id="vf-model" type="text" value={form.model} onChange={(e) => setField("model", e.target.value)} placeholder="ex : Clio" style={inputStyle} />
            <FieldError message={errors.model} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-year" style={labelStyle}>Année *</label>
            <input id="vf-year" type="number" min={2000} max={2030} value={form.year} onChange={(e) => setField("year", e.target.value)} placeholder="ex : 2024" style={inputStyle} />
            <FieldError message={errors.year} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-moteur" style={labelStyle}>Motorisation *</label>
            <select id="vf-moteur" value={form.moteur} onChange={(e) => setField("moteur", e.target.value as VehicleMoteur)} style={inputStyle}>
              {MOTEURS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-km" style={labelStyle}>Kilométrage *</label>
            <input id="vf-km" type="number" min={0} value={form.km} onChange={(e) => setField("km", e.target.value)} placeholder="ex : 12000" style={inputStyle} />
            <FieldError message={errors.km} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-couleur" style={labelStyle}>Couleur *</label>
            <input id="vf-couleur" type="text" value={form.spec_couleur} onChange={(e) => setField("spec_couleur", e.target.value)} placeholder="ex : Blanc nacré" style={inputStyle} />
            <FieldError message={errors.spec_couleur} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-boite" style={labelStyle}>Boîte de vitesses *</label>
            <select id="vf-boite" value={form.spec_boite} onChange={(e) => setField("spec_boite", e.target.value)} style={inputStyle}>
              {BOITES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-puissance" style={labelStyle}>Puissance *</label>
            <input id="vf-puissance" type="text" value={form.spec_puissance} onChange={(e) => setField("spec_puissance", e.target.value)} placeholder="ex : 130 ch" style={inputStyle} />
            <FieldError message={errors.spec_puissance} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-places" style={labelStyle}>Nombre de places</label>
            <input id="vf-places" type="number" min={1} max={9} value={form.spec_places} onChange={(e) => setField("spec_places", e.target.value)} style={inputStyle} />
          </div>
        </div>
      </fieldset>

      {/* ── Tarification ──────────────────────────────────────────────────── */}
      <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
        <legend style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", padding: "0 6px" }}>
          Tarification
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <div style={groupStyle}>
            <label htmlFor="vf-prix" style={labelStyle}>Prix de vente HT * (€)</label>
            <input id="vf-prix" type="number" min={0} step={0.01} value={form.prix} onChange={(e) => setField("prix", e.target.value)} placeholder="ex : 19990" style={inputStyle} />
            <FieldError message={errors.prix} />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Type de contrat *</label>
            <div style={{ display: "flex", gap: "1.2rem", alignItems: "center", height: 40 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="vf-lld" value="achat" checked={!form.lld} onChange={() => setField("lld", false)} />
                <span style={{ fontSize: ".9rem" }}>Achat</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="vf-lld" value="lld" checked={form.lld} onChange={() => setField("lld", true)} />
                <span style={{ fontSize: ".9rem" }}>LLD</span>
              </label>
            </div>
          </div>
          {form.lld && (
            <div style={groupStyle}>
              <label htmlFor="vf-mensualite" style={labelStyle}>Mensualité LLD HT * (€/mois)</label>
              <input id="vf-mensualite" type="number" min={0} step={0.01} value={form.mensualite} onChange={(e) => setField("mensualite", e.target.value)} placeholder="ex : 299" style={inputStyle} />
              <FieldError message={errors.mensualite} />
            </div>
          )}
        </div>
      </fieldset>

      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
        <legend style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", padding: "0 6px" }}>Photo</legend>
        <div style={groupStyle}>
          <label htmlFor="vf-img" style={labelStyle}>URL photo principale *</label>
          <input id="vf-img" type="url" value={form.img} onChange={(e) => setField("img", e.target.value)} placeholder="https://example.com/photo.jpg" style={inputStyle} />
          <FieldError message={errors.img} />
          {form.img.trim() && (
            <Image src={form.img.trim()} alt="Aperçu" width={320} height={120} unoptimized
              style={{ marginTop: 8, maxHeight: 120, maxWidth: "100%", objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }} />
          )}
        </div>
      </fieldset>

      {/* ── Publication ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.4rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={form.visible_catalogue} onChange={(e) => setField("visible_catalogue", e.target.checked)} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: ".9rem", color: "#374151" }}>Visible dans le catalogue</span>
        </label>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel}
          style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: ".9rem", cursor: "pointer" }}>
          Annuler
        </button>
        <button type="submit" disabled={submitting}
          style={{ padding: "9px 24px", borderRadius: 8, background: submitting ? "#94a3b8" : "var(--navy)", color: "#fff", border: 0, fontWeight: 700, fontSize: ".9rem", cursor: submitting ? "not-allowed" : "pointer" }}>
          {submitting ? "Enregistrement…" : mode === "add" ? "Ajouter au catalogue" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
