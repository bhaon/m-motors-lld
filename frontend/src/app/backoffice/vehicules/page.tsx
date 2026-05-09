"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ── Types ────────────────────────────────────────────────────────────────────

interface ToggleResponse {
  vehicle: { id: number; lld: boolean; mensualite: number | null };
  toggled: boolean;
  warning?: string;
  active_dossiers_count: number;
}

interface VehicleSpecs {
  carburant: string;
  boite: string;
  couleur: string;
  places: number;
  puissance: string;
}

interface VehicleBoItem {
  id: number;
  make: string;
  model: string;
  year: number;
  km: number;
  moteur: string;
  prix: number;
  lld: boolean;
  mensualite: number | null;
  img: string;
  archived: boolean;
  archived_at: string | null;
  visible_catalogue: boolean;
  specs: VehicleSpecs;
}

interface FormState {
  make: string;
  model: string;
  year: string;
  moteur: string;
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

// ── Constantes ───────────────────────────────────────────────────────────────

const MOTEURS = ["Essence", "Diesel", "Hybride", "Électrique"] as const;
const BOITES = ["Manuelle", "Automatique", "CVT"] as const;

const INITIAL_FORM: FormState = {
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

// ── URL helpers ──────────────────────────────────────────────────────────────

function apiBase(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  return pub ? pub.replace(/\/$/, "") : "";
}

function urlBackoffice(archived = false): string {
  return `${apiBase()}/api/v1/vehicules/backoffice${archived ? "?archived=true" : ""}`;
}

function urlRestaurer(id: number): string {
  return `${apiBase()}/api/v1/vehicules/${id}/restaurer`;
}

function urlPhotos(vehicleId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos`;
}

function urlPhotoDelete(vehicleId: number, photoId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos/${photoId}`;
}

function urlPhotoMain(vehicleId: number, photoId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos/${photoId}/principal`;
}

function urlPhotoReorder(vehicleId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos/reordonner`;
}

function urlPhotoUploadInit(vehicleId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos/upload-init`;
}

function urlPhotoUploadComplete(vehicleId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos/upload-complete`;
}

function urlPhotoLibrary(): string {
  return `${apiBase()}/api/v1/vehicules/photos/bibliotheque`;
}

function urlPhotoFromLibrary(vehicleId: number): string {
  return `${apiBase()}/api/v1/vehicules/${vehicleId}/photos/depuis-bibliotheque`;
}

function urlCreer(): string {
  return `${apiBase()}/api/v1/vehicules/creer`;
}

function urlVehicule(id: number): string {
  return `${apiBase()}/api/v1/vehicules/${id}`;
}

function urlToggleLld(id: number, confirm = false): string {
  return `${apiBase()}/api/v1/vehicules/${id}/toggle-lld${confirm ? "?confirm=true" : ""}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function vehicleToForm(v: VehicleBoItem): FormState {
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

// ── Composants utilitaires ───────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ color: "#b91c1c", fontSize: ".82rem", marginTop: 4 }}>
      {message}
    </p>
  );
}

function Badge({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: ".75rem",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

// ── Formulaire véhicule (réutilisé add + edit) ────────────────────────────────

/** Formulaire modal création / édition ; reconstruit un `VehicleBoItem` après succès API. */
function VehicleForm({
  mode,
  initial,
  onSuccess,
  onCancel,
  targetId,
  archivedSnapshot,
}: {
  mode: "add" | "edit";
  initial: FormState;
  onSuccess: (v: VehicleBoItem, isNew: boolean) => void;
  onCancel: () => void;
  targetId?: number;
  /** État archive au moment d’ouvrir le formulaire (mode edit uniquement). */
  archivedSnapshot?: { archived: boolean; archived_at: string | null };
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  function set(field: keyof FormState, value: string | boolean) {
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

      let res: Response;
      if (mode === "add") {
        res = await fetch(urlCreer(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(urlVehicule(targetId!), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Erreur lors de l'enregistrement.");
      }

      const data = await res.json();

      if (mode === "add") {
        // POST /creer retourne { id, reference, message } — on reconstruit un VehicleBoItem minimal
        // (champs archive : toujours faux / null pour un véhicule fraîchement créé)
        const created: VehicleBoItem = {
          id: (data as { id: number }).id,
          make: body.make,
          model: body.model,
          year: body.year,
          km: body.km,
          moteur: body.moteur,
          prix: body.prix,
          lld: body.lld,
          mensualite: body.mensualite ?? null,
          img: body.img,
          archived: false,
          archived_at: null,
          visible_catalogue: body.visible_catalogue,
          specs: {
            carburant: body.spec_carburant,
            boite: body.spec_boite,
            couleur: body.spec_couleur,
            places: body.spec_places,
            puissance: body.spec_puissance,
          },
        };
        onSuccess(created, true);
      } else {
        // PATCH retourne VehicleOut (sans visible_catalogue ni archive) — fusion form + snapshot ouverture
        const updated: VehicleBoItem = {
          id: targetId!,
          make: body.make,
          model: body.model,
          year: body.year,
          km: body.km,
          moteur: body.moteur,
          prix: body.prix,
          lld: body.lld,
          mensualite: body.mensualite ?? null,
          img: body.img,
          // L’API ne renvoie pas l’état archive : on le reprend du véhicule édité (liste Actifs / Archivés cohérente)
          archived: archivedSnapshot?.archived ?? false,
          archived_at: archivedSnapshot?.archived_at ?? null,
          visible_catalogue: body.visible_catalogue,
          specs: {
            carburant: body.spec_carburant,
            boite: body.spec_boite,
            couleur: body.spec_couleur,
            places: body.spec_places,
            puissance: body.spec_puissance,
          },
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

      {/* ── Identité ────────────────────── */}
      <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
        <legend style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", padding: "0 6px" }}>
          Identité du véhicule
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <div style={groupStyle}>
            <label htmlFor="vf-make" style={labelStyle}>Marque *</label>
            <input id="vf-make" type="text" value={form.make} onChange={(e) => set("make", e.target.value)}
              placeholder="ex : Renault" style={inputStyle} />
            <FieldError message={errors.make} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-model" style={labelStyle}>Modèle *</label>
            <input id="vf-model" type="text" value={form.model} onChange={(e) => set("model", e.target.value)}
              placeholder="ex : Clio" style={inputStyle} />
            <FieldError message={errors.model} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-year" style={labelStyle}>Année *</label>
            <input id="vf-year" type="number" min={2000} max={2030} value={form.year}
              onChange={(e) => set("year", e.target.value)} placeholder="ex : 2024" style={inputStyle} />
            <FieldError message={errors.year} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-moteur" style={labelStyle}>Motorisation *</label>
            <select id="vf-moteur" value={form.moteur} onChange={(e) => set("moteur", e.target.value)} style={inputStyle}>
              {MOTEURS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-km" style={labelStyle}>Kilométrage *</label>
            <input id="vf-km" type="number" min={0} value={form.km}
              onChange={(e) => set("km", e.target.value)} placeholder="ex : 12000" style={inputStyle} />
            <FieldError message={errors.km} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-couleur" style={labelStyle}>Couleur *</label>
            <input id="vf-couleur" type="text" value={form.spec_couleur}
              onChange={(e) => set("spec_couleur", e.target.value)} placeholder="ex : Blanc nacré" style={inputStyle} />
            <FieldError message={errors.spec_couleur} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-boite" style={labelStyle}>Boîte de vitesses *</label>
            <select id="vf-boite" value={form.spec_boite} onChange={(e) => set("spec_boite", e.target.value)} style={inputStyle}>
              {BOITES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-puissance" style={labelStyle}>Puissance *</label>
            <input id="vf-puissance" type="text" value={form.spec_puissance}
              onChange={(e) => set("spec_puissance", e.target.value)} placeholder="ex : 130 ch" style={inputStyle} />
            <FieldError message={errors.spec_puissance} />
          </div>
          <div style={groupStyle}>
            <label htmlFor="vf-places" style={labelStyle}>Nombre de places</label>
            <input id="vf-places" type="number" min={1} max={9} value={form.spec_places}
              onChange={(e) => set("spec_places", e.target.value)} style={inputStyle} />
          </div>
        </div>
      </fieldset>

      {/* ── Tarification ────────────────── */}
      <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
        <legend style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", padding: "0 6px" }}>
          Tarification
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
          <div style={groupStyle}>
            <label htmlFor="vf-prix" style={labelStyle}>Prix de vente HT * (€)</label>
            <input id="vf-prix" type="number" min={0} step={0.01} value={form.prix}
              onChange={(e) => set("prix", e.target.value)} placeholder="ex : 19990" style={inputStyle} />
            <FieldError message={errors.prix} />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Type de contrat *</label>
            <div style={{ display: "flex", gap: "1.2rem", alignItems: "center", height: 40 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="vf-lld" value="achat" checked={!form.lld} onChange={() => set("lld", false)} />
                <span style={{ fontSize: ".9rem" }}>Achat</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" name="vf-lld" value="lld" checked={form.lld} onChange={() => set("lld", true)} />
                <span style={{ fontSize: ".9rem" }}>LLD</span>
              </label>
            </div>
          </div>
          {form.lld && (
            <div style={groupStyle}>
              <label htmlFor="vf-mensualite" style={labelStyle}>Mensualité LLD HT * (€/mois)</label>
              <input id="vf-mensualite" type="number" min={0} step={0.01} value={form.mensualite}
                onChange={(e) => set("mensualite", e.target.value)} placeholder="ex : 299" style={inputStyle} />
              <FieldError message={errors.mensualite} />
            </div>
          )}
        </div>
      </fieldset>

      {/* ── Photo ─────────────────────── */}
      <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.2rem", marginBottom: "1.2rem" }}>
        <legend style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", padding: "0 6px" }}>Photo</legend>
        <div style={groupStyle}>
          <label htmlFor="vf-img" style={labelStyle}>URL photo principale *</label>
          <input id="vf-img" type="url" value={form.img} onChange={(e) => set("img", e.target.value)}
            placeholder="https://example.com/photo.jpg" style={inputStyle} />
          <FieldError message={errors.img} />
          {form.img.trim() && (
            <img src={form.img.trim()} alt="Aperçu"
              style={{ marginTop: 8, maxHeight: 120, maxWidth: "100%", objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
        </div>
      </fieldset>

      {/* ── Publication ─────────────────── */}
      <div style={{ marginBottom: "1.4rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={form.visible_catalogue}
            onChange={(e) => set("visible_catalogue", e.target.checked)}
            style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: ".9rem", color: "#374151" }}>
            Visible dans le catalogue
          </span>
        </label>
      </div>

      {/* ── Actions ─────────────────────── */}
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

// ── Modal ────────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "3rem 1rem",
        overflowY: "auto",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
          width: "100%",
          maxWidth: 720,
          padding: "1.8rem 2rem 2rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.4rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--navy)" }}>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: "1.4rem", color: "#6b7280", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Gestion des photos ────────────────────────────────────────────────────────

interface PhotoItem {
  id: number;
  url: string;
  is_main: boolean;
  order: number;
}

interface LibraryPhoto {
  id: number;
  url: string;
  vehicle_id: number;
  vehicle_make: string;
  vehicle_model: string;
}

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 Mo

function PhotoModal({ vehicle, onClose }: { vehicle: VehicleBoItem; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"galerie" | "upload" | "bibliotheque">("galerie");

  // Galerie
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [orderEdits, setOrderEdits] = useState<Record<number, string>>({});

  // Upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<{ total: number; done: number; current: string; error: string }>
    ({ total: 0, done: 0, current: "", error: "" });
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  // Bibliothèque
  const [library, setLibrary] = useState<LibraryPhoto[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── Galerie ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(urlPhotos(vehicle.id), { credentials: "include" })
      .then((r) => r.json())
      .then((data: PhotoItem[]) => { setPhotos(data); setGalleryLoading(false); })
      .catch(() => setGalleryLoading(false));
  }, [vehicle.id]);

  async function handleSetMain(photoId: number) {
    const res = await fetch(urlPhotoMain(vehicle.id, photoId), { method: "PATCH", credentials: "include" });
    if (res.ok) setPhotos(await res.json());
  }

  async function handleDelete(photoId: number) {
    const res = await fetch(urlPhotoDelete(vehicle.id, photoId), { method: "DELETE", credentials: "include" });
    if (res.ok || res.status === 204) { setPhotos((prev) => prev.filter((p) => p.id !== photoId)); setDeleteConfirm(null); }
  }

  async function handleReorder() {
    const payload = photos.filter((p) => orderEdits[p.id] !== undefined)
      .map((p) => ({ id: p.id, order: parseInt(orderEdits[p.id] ?? String(p.order), 10) }));
    if (!payload.length) return;
    const res = await fetch(urlPhotoReorder(vehicle.id), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos: payload }),
    });
    if (res.ok) { setPhotos(await res.json()); setOrderEdits({}); }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const errors: string[] = [];
    const valid: File[] = [];
    for (const f of files) {
      if (!["image/jpeg", "image/jpg", "image/png"].includes(f.type)) {
        errors.push(`${f.name} : format non supporté (JPG/PNG uniquement).`);
      } else if (f.size > MAX_PHOTO_SIZE) {
        errors.push(`${f.name} : fichier trop volumineux (5 Mo max).`);
      } else {
        valid.push(f);
      }
    }
    setFileErrors(errors);
    setSelectedFiles(valid);
  }

  async function handleUpload() {
    if (!selectedFiles.length) return;
    setUploadState({ total: selectedFiles.length, done: 0, current: "", error: "" });
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadState((s) => ({ ...s, current: file.name }));
      try {
        // 1. Obtenir l'URL pré-signée
        const initRes = await fetch(urlPhotoUploadInit(vehicle.id), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content_type: file.type, file_size: file.size }),
        });
        if (!initRes.ok) throw new Error("Impossible d'initialiser l'upload.");
        const { upload_url, object_key } = (await initRes.json()) as { upload_url: string; object_key: string };

        // 2. Upload direct vers MinIO
        const putRes = await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!putRes.ok) throw new Error(`Upload MinIO échoué pour ${file.name}.`);

        // 3. Confirmer en base
        const completeRes = await fetch(urlPhotoUploadComplete(vehicle.id), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ object_key }),
        });
        if (!completeRes.ok) throw new Error("Confirmation d'upload échouée.");
        const updatedPhotos = (await completeRes.json()) as PhotoItem[];
        setPhotos(updatedPhotos);
        setUploadState((s) => ({ ...s, done: s.done + 1 }));
      } catch (err: unknown) {
        setUploadState((s) => ({ ...s, error: err instanceof Error ? err.message : "Erreur inattendue." }));
        break;
      }
    }
    setSelectedFiles([]);
    setUploadState((s) => s.error ? s : { ...s, current: "", total: 0, done: 0 });
  }

  // ── Bibliothèque ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "bibliotheque") return;
    setLibraryLoading(true);
    fetch(urlPhotoLibrary(), { credentials: "include" })
      .then((r) => r.json())
      .then((data: LibraryPhoto[]) => {
        setLibrary(data.filter((p) => p.vehicle_id !== vehicle.id));
        setLibraryLoading(false);
      })
      .catch(() => setLibraryLoading(false));
  }, [activeTab, vehicle.id]);

  async function handleAddFromLibrary(sourceId: number) {
    const res = await fetch(urlPhotoFromLibrary(vehicle.id), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_photo_id: sourceId }),
    });
    if (res.ok) {
      const updated = (await res.json()) as PhotoItem[];
      setPhotos(updated);
      setActiveTab("galerie");
    }
  }

  // ── Rendu ───────────────────────────────────────────────────────────────────

  const tabBtn = (tab: typeof activeTab, label: string) => (
    <button key={tab} type="button"
      aria-selected={activeTab === tab}
      onClick={() => setActiveTab(tab)}
      style={{
        padding: "7px 18px", border: 0, borderRadius: "7px 7px 0 0",
        background: activeTab === tab ? "var(--navy)" : "#f1f5f9",
        color: activeTab === tab ? "#fff" : "#374151",
        fontWeight: 700, fontSize: ".85rem", cursor: "pointer",
      }}
    >{label}</button>
  );

  return (
    <Modal title={`Photos — ${vehicle.make} ${vehicle.model}`} onClose={onClose}>
      {/* Onglets */}
      <div style={{ display: "flex", gap: ".4rem", marginBottom: "1.2rem", borderBottom: "2px solid #e5e7eb", paddingBottom: ".4rem" }}>
        {tabBtn("galerie", `Galerie (${photos.length})`)}
        {tabBtn("upload", "Uploader")}
        {tabBtn("bibliotheque", "Bibliothèque")}
      </div>

      {/* ── Onglet Galerie ── */}
      {activeTab === "galerie" && (
        galleryLoading ? <p style={{ color: "#6b7280" }}>Chargement…</p> : (
          <>
            {photos.length === 0 ? (
              <p style={{ color: "#6b7280", marginBottom: "1rem" }}>Aucune photo. Utilisez l'onglet <strong>Uploader</strong>.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: ".8rem", marginBottom: "1.2rem" }}>
                {photos.map((p) => (
                  <div key={p.id} style={{ border: p.is_main ? "2px solid #0e7490" : "1px solid #e5e7eb", borderRadius: 9, overflow: "hidden", background: "#f9fafb" }}>
                    <img src={p.url} alt={`Photo ${p.id}`} aria-label={`Photo ${p.id}`}
                      style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = ".3"; }} />
                    <div style={{ padding: "5px 7px" }}>
                      {p.is_main && <span style={{ display: "block", fontSize: ".68rem", fontWeight: 700, color: "#0e7490", marginBottom: 3 }}>Principale</span>}
                      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: ".7rem", color: "#6b7280" }}>Ordre :</span>
                        <input type="number" aria-label={`Ordre photo ${p.id}`}
                          value={orderEdits[p.id] ?? String(p.order)}
                          onChange={(e) => setOrderEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          style={{ width: 42, padding: "2px 4px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: ".75rem" }} />
                      </div>
                      {!p.is_main && (
                        <button type="button" aria-label={`Définir photo ${p.id} comme principale`} onClick={() => handleSetMain(p.id)}
                          style={{ width: "100%", padding: "3px 0", background: "#ecfeff", color: "#0e7490", border: "1px solid #bae6fd", borderRadius: 4, fontSize: ".7rem", fontWeight: 600, cursor: "pointer", marginBottom: 3 }}>
                          Définir principale
                        </button>
                      )}
                      {deleteConfirm === p.id ? (
                        <div style={{ display: "flex", gap: 3 }}>
                          <button type="button" aria-label={`Confirmer suppression photo ${p.id}`} onClick={() => handleDelete(p.id)}
                            style={{ flex: 1, padding: "3px 0", background: "#b91c1c", color: "#fff", border: 0, borderRadius: 4, fontSize: ".7rem", fontWeight: 700, cursor: "pointer" }}>Oui</button>
                          <button type="button" onClick={() => setDeleteConfirm(null)}
                            style={{ flex: 1, padding: "3px 0", background: "#f3f4f6", color: "#374151", border: 0, borderRadius: 4, fontSize: ".7rem", cursor: "pointer" }}>Non</button>
                        </div>
                      ) : (
                        <button type="button" aria-label={`Supprimer photo ${p.id}`} onClick={() => setDeleteConfirm(p.id)}
                          style={{ width: "100%", padding: "3px 0", background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 4, fontSize: ".7rem", fontWeight: 600, cursor: "pointer" }}>
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(orderEdits).length > 0 && (
              <button type="button" onClick={handleReorder}
                style={{ padding: "7px 16px", background: "var(--navy)", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}>
                Appliquer le nouvel ordre
              </button>
            )}
          </>
        )
      )}

      {/* ── Onglet Upload ── */}
      {activeTab === "upload" && (
        <div>
          <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", color: "#374151", marginBottom: 8 }}>
            Sélectionner des fichiers (JPG ou PNG, max 5 Mo par photo)
          </label>
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            multiple
            aria-label="Sélectionner des photos"
            onChange={handleFilePick}
            style={{ display: "block", marginBottom: 8, fontSize: ".88rem" }}
          />
          {fileErrors.length > 0 && (
            <div role="alert" style={{ background: "#fee2e2", borderRadius: 7, padding: "8px 12px", marginBottom: 8 }}>
              {fileErrors.map((e, i) => <p key={i} style={{ margin: 0, fontSize: ".82rem", color: "#b91c1c" }}>{e}</p>)}
            </div>
          )}
          {selectedFiles.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: ".85rem", color: "#374151", marginBottom: 4 }}>
                {selectedFiles.length} fichier(s) sélectionné(s) :
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".82rem", color: "#6b7280" }}>
                {selectedFiles.map((f) => <li key={f.name}>{f.name} ({(f.size / 1024).toFixed(0)} Ko)</li>)}
              </ul>
            </div>
          )}
          {uploadState.total > 0 && (
            <p style={{ fontSize: ".85rem", color: "#374151", marginBottom: 8 }}>
              {uploadState.error
                ? <span style={{ color: "#b91c1c" }}>{uploadState.error}</span>
                : <>Upload en cours : <strong>{uploadState.current}</strong> ({uploadState.done}/{uploadState.total})</>}
            </p>
          )}
          <button
            type="button"
            aria-label="Uploader les photos sélectionnées"
            onClick={handleUpload}
            disabled={!selectedFiles.length || uploadState.total > uploadState.done}
            style={{
              padding: "9px 22px",
              background: !selectedFiles.length ? "#94a3b8" : "var(--navy)",
              color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, fontSize: ".9rem",
              cursor: !selectedFiles.length ? "not-allowed" : "pointer",
            }}
          >
            {uploadState.total > uploadState.done ? "Upload en cours…" : "Uploader"}
          </button>
        </div>
      )}

      {/* ── Onglet Bibliothèque ── */}
      {activeTab === "bibliotheque" && (
        libraryLoading ? <p style={{ color: "#6b7280" }}>Chargement…</p> : library.length === 0 ? (
          <p style={{ color: "#6b7280" }}>Aucune photo disponible dans la bibliothèque.</p>
        ) : (
          <div>
            <p style={{ fontSize: ".85rem", color: "#6b7280", marginBottom: "1rem" }}>
              Cliquez sur une photo pour l'ajouter à la galerie de ce véhicule.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: ".8rem" }}>
              {library.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Ajouter la photo ${p.id} du ${p.vehicle_make} ${p.vehicle_model}`}
                  onClick={() => handleAddFromLibrary(p.id)}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 9, overflow: "hidden", background: "#f9fafb", cursor: "pointer", padding: 0, textAlign: "left" }}
                >
                  <img src={p.url} alt={`${p.vehicle_make} ${p.vehicle_model}`}
                    style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = ".3"; }} />
                  <div style={{ padding: "4px 6px" }}>
                    <span style={{ fontSize: ".7rem", color: "#374151", fontWeight: 600 }}>
                      {p.vehicle_make} {p.vehicle_model}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </Modal>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function GestionVehiculesPage() {
  const [vehicles, setVehicles] = useState<VehicleBoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Modal add/edit
  const [modalMode, setModalMode] = useState<"closed" | "add" | "edit">("closed");
  const [editTarget, setEditTarget] = useState<VehicleBoItem | null>(null);

  // Delete confirm: id en attente de confirmation ou null
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Filtre Actifs / Archivés
  const [activeFilter, setActiveFilter] = useState<"actifs" | "archives">("actifs");

  // Gestion des photos
  const [photoTarget, setPhotoTarget] = useState<VehicleBoItem | null>(null);

  // Toggle LLD warning: véhicule en attente de confirmation
  const [toggleWarning, setToggleWarning] = useState<{
    vehicleId: number;
    warning: string;
    activeDossiers: number;
  } | null>(null);

  // Toast de feedback après action
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(urlBackoffice(activeFilter === "archives"), { credentials: "include" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Erreur de chargement.");
      }
      const data = (await res.json()) as VehicleBoItem[];
      setVehicles(data);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null);
    setModalMode("add");
  }

  function openEdit(v: VehicleBoItem) {
    setEditTarget(v);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode("closed");
    setEditTarget(null);
  }

  function handleFormSuccess(v: VehicleBoItem, isNew: boolean) {
    if (isNew) {
      setVehicles((prev) => [v, ...prev]);
      setToast({ type: "success", text: `Véhicule ${v.make} ${v.model} ajouté avec succès.` });
    } else {
      setVehicles((prev) => prev.map((item) => (item.id === v.id ? v : item)));
      setToast({ type: "success", text: `Véhicule ${v.make} ${v.model} mis à jour.` });
    }
    closeModal();
  }

  async function handleDelete(id: number) {
    setDeleteError("");
    try {
      const res = await fetch(urlVehicule(id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Erreur lors de la suppression.");
      }
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      setDeleteConfirmId(null);
      setToast({ type: "success", text: "Véhicule archivé." });
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Erreur inattendue.");
    }
  }

  async function handleRestore(vehicle: VehicleBoItem) {
    try {
      const res = await fetch(urlRestaurer(vehicle.id), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Erreur lors de la restauration.");
      }
      setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));
      setToast({ type: "success", text: `${vehicle.make} ${vehicle.model} restauré au catalogue.` });
    } catch (err: unknown) {
      setToast({ type: "error", text: err instanceof Error ? err.message : "Erreur inattendue." });
    }
  }

  async function handleToggle(vehicle: VehicleBoItem, forceConfirm = false) {
    try {
      const res = await fetch(urlToggleLld(vehicle.id, forceConfirm), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Erreur lors de la bascule.");
      }
      const data = (await res.json()) as ToggleResponse;
      if (!data.toggled && data.warning) {
        setToggleWarning({ vehicleId: vehicle.id, warning: data.warning, activeDossiers: data.active_dossiers_count });
        return;
      }
      setVehicles((prev) =>
        prev.map((item) =>
          item.id === vehicle.id
            ? { ...item, lld: data.vehicle.lld, mensualite: data.vehicle.mensualite }
            : item,
        ),
      );
      setToggleWarning(null);
      const newMode = data.vehicle.lld ? "LLD" : "Vente";
      setToast({ type: "success", text: `${vehicle.make} ${vehicle.model} basculé en ${newMode}.` });
    } catch (err: unknown) {
      setToast({ type: "error", text: err instanceof Error ? err.message : "Erreur inattendue." });
    }
  }

  // ── Statistiques ─────────────────────────────────────────────────────────

  const total = vehicles.length;
  const nbLld = vehicles.filter((v) => v.lld).length;
  const nbAchat = total - nbLld;
  const nbMasques = vehicles.filter((v) => !v.visible_catalogue).length;

  // ── Styles partagés ──────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: ".78rem",
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: ".05em",
    borderBottom: "1px solid #e5e7eb",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: ".88rem",
    color: "#111827",
    verticalAlign: "middle",
    borderBottom: "1px solid #f3f4f6",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />

      {/* Modal add/edit */}
      {/* Modal photos */}
      {photoTarget && (
        <PhotoModal vehicle={photoTarget} onClose={() => setPhotoTarget(null)} />
      )}

      {modalMode !== "closed" && (
        <Modal
          title={modalMode === "add" ? "Ajouter un véhicule" : `Modifier — ${editTarget?.make} ${editTarget?.model}`}
          onClose={closeModal}
        >
          <VehicleForm
            mode={modalMode}
            initial={modalMode === "edit" && editTarget ? vehicleToForm(editTarget) : INITIAL_FORM}
            targetId={editTarget?.id}
            // Permet de garder archived / archived_at après PATCH (réponse API incomplète)
            archivedSnapshot={
              modalMode === "edit" && editTarget
                ? { archived: editTarget.archived, archived_at: editTarget.archived_at }
                : undefined
            }
            onSuccess={handleFormSuccess}
            onCancel={closeModal}
          />
        </Modal>
      )}

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* En-tête */}
        <nav style={{ fontSize: ".82rem", color: "#6b7280", marginBottom: "1.2rem" }}>
          <Link href="/" style={{ color: "var(--navy)", textDecoration: "none" }}>Catalogue</Link>
          {" / "}
          <span>Gestion des véhicules</span>
        </nav>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.6rem" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--navy)", margin: 0 }}>
            Gestion des véhicules
          </h1>
          <button
            type="button"
            onClick={openAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 20px",
              background: "var(--navy)",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              fontSize: ".9rem",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>+</span>
            Nouveau véhicule
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role={toast.type === "success" ? "status" : "alert"}
            aria-live="polite"
            style={{
              background: toast.type === "success" ? "#dcfce7" : "#fee2e2",
              border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fca5a5"}`,
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: "1.2rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ fontWeight: 600, color: toast.type === "success" ? "#15803d" : "#b91c1c", fontSize: ".9rem" }}>
              {toast.text}
            </span>
            <button
              type="button"
              onClick={() => setToast(null)}
              style={{ background: "none", border: 0, cursor: "pointer", color: "#6b7280", fontSize: "1.1rem" }}
              aria-label="Fermer la notification"
            >
              ×
            </button>
          </div>
        )}

        {/* Onglets filtre Actifs / Archivés */}
        <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.2rem", borderBottom: "2px solid #e5e7eb", paddingBottom: ".5rem" }}>
          {(["actifs", "archives"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={activeFilter === f}
              onClick={() => { setActiveFilter(f); setToggleWarning(null); setDeleteConfirmId(null); }}
              style={{
                padding: "7px 18px",
                borderRadius: "8px 8px 0 0",
                border: activeFilter === f ? "2px solid var(--navy)" : "2px solid transparent",
                background: activeFilter === f ? "var(--navy)" : "#f1f5f9",
                color: activeFilter === f ? "#fff" : "#374151",
                fontWeight: 700,
                fontSize: ".88rem",
                cursor: "pointer",
              }}
            >
              {f === "actifs" ? "Actifs" : "Archivés"}
            </button>
          ))}
        </div>

        {/* Barre de stats (vue actifs uniquement) */}
        {!loading && !loadError && activeFilter === "actifs" && (
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1.4rem", flexWrap: "wrap" }}>
            {[
              { label: "Total", value: total, color: "#0f172a", bg: "#f1f5f9" },
              { label: "LLD", value: nbLld, color: "#0e7490", bg: "#ecfeff" },
              { label: "Achat", value: nbAchat, color: "#1d4ed8", bg: "#eff6ff" },
              { label: "Masqués", value: nbMasques, color: "#b45309", bg: "#fffbeb" },
            ].map(({ label, value, color, bg }) => (
              <div
                key={label}
                style={{
                  background: bg,
                  borderRadius: 10,
                  padding: "12px 20px",
                  minWidth: 100,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: ".75rem", color: "#6b7280", fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Erreur de chargement */}
        {loadError && (
          <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "14px 18px", color: "#b91c1c", fontWeight: 600, marginBottom: "1.2rem" }}>
            {loadError}
          </div>
        )}

        {/* Erreur de suppression */}
        {deleteError && (
          <div role="alert" style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "14px 18px", color: "#b91c1c", fontWeight: 600, marginBottom: "1.2rem" }}>
            {deleteError}
          </div>
        )}

        {/* Chargement */}
        {loading && (
          <p style={{ color: "#6b7280", textAlign: "center", padding: "3rem 0" }}>Chargement…</p>
        )}

        {/* État vide */}
        {!loading && !loadError && vehicles.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "#6b7280" }}>
            {activeFilter === "actifs" ? (
              <>
                <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Aucun véhicule dans le catalogue</p>
                <button
                  type="button"
                  onClick={openAdd}
                  style={{ padding: "9px 22px", background: "var(--navy)", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
                >
                  + Ajouter le premier véhicule
                </button>
              </>
            ) : (
              <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>Aucun véhicule archivé</p>
            )}
          </div>
        )}

        {/* Tableau */}
        {!loading && !loadError && vehicles.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={thStyle}>Photo</th>
                  <th style={thStyle}>Véhicule</th>
                  <th style={thStyle}>Année</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Prix HT</th>
                  <th style={thStyle}>{activeFilter === "archives" ? "Archivé le" : "Visibilité"}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} style={{ transition: "background .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>
                      <img
                        src={v.img}
                        alt={`${v.make} ${v.model}`}
                        style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 700 }}>{v.make} {v.model}</span>
                      <br />
                      <span style={{ fontSize: ".78rem", color: "#6b7280" }}>{v.specs.couleur} · {v.specs.puissance}</span>
                    </td>
                    <td style={tdStyle}>{v.year}</td>
                    <td style={tdStyle}>
                      {v.lld ? (
                        <Badge label="LLD" color="#0e7490" bg="#ecfeff" />
                      ) : (
                        <Badge label="Achat" color="#1e40af" bg="#eff6ff" />
                      )}
                      {v.lld && v.mensualite != null && (
                        <div style={{ fontSize: ".75rem", color: "#0e7490", marginTop: 2 }}>
                          {v.mensualite.toLocaleString("fr-FR")} €/mois
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {v.prix.toLocaleString("fr-FR")} €
                    </td>
                    <td style={tdStyle}>
                      {activeFilter === "archives" ? (
                        <span style={{ fontSize: ".8rem", color: "#6b7280" }}>
                          {v.archived_at
                            ? new Date(v.archived_at).toLocaleDateString("fr-FR")
                            : "—"}
                        </span>
                      ) : v.visible_catalogue ? (
                        <Badge label="Visible" color="#15803d" bg="#dcfce7" />
                      ) : (
                        <Badge label="Masqué" color="#92400e" bg="#fef3c7" />
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      {/* Vue archivés : seul bouton Restaurer */}
                      {activeFilter === "archives" ? (
                        <button
                          type="button"
                          aria-label={`Restaurer ${v.make} ${v.model}`}
                          onClick={() => handleRestore(v)}
                          style={{ padding: "5px 14px", background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 6, fontWeight: 700, fontSize: ".82rem", cursor: "pointer" }}
                        >
                          Restaurer
                        </button>
                      ) : null}
                      {/* Actions normales (vue actifs uniquement) */}
                      {activeFilter === "actifs" && deleteConfirmId === v.id ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: ".82rem", color: "#374151", fontWeight: 600 }}>Confirmer ?</span>
                          <button
                            type="button"
                            aria-label={`Confirmer la suppression de ${v.make} ${v.model}`}
                            onClick={() => handleDelete(v.id)}
                            style={{ padding: "5px 12px", background: "#b91c1c", color: "#fff", border: 0, borderRadius: 6, fontWeight: 700, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Oui
                          </button>
                          <button
                            type="button"
                            aria-label="Non"
                            onClick={() => { setDeleteConfirmId(null); setDeleteError(""); }}
                            style={{ padding: "5px 12px", background: "#f3f4f6", color: "#374151", border: 0, borderRadius: 6, fontWeight: 600, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Non
                          </button>
                        </span>
                      ) : activeFilter === "actifs" && toggleWarning?.vehicleId === v.id ? (
                        /* Avertissement dossiers actifs avant bascule */
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: ".82rem", color: "#b45309", fontWeight: 600 }}>
                            ⚠ {toggleWarning.activeDossiers} dossier(s) actif(s)
                          </span>
                          <button
                            type="button"
                            aria-label={`Confirmer la bascule de ${v.make} ${v.model}`}
                            onClick={() => handleToggle(v, true)}
                            style={{ padding: "5px 12px", background: "#b45309", color: "#fff", border: 0, borderRadius: 6, fontWeight: 700, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Basculer quand même
                          </button>
                          <button
                            type="button"
                            aria-label={`Annuler la bascule de ${v.make} ${v.model}`}
                            onClick={() => setToggleWarning(null)}
                            style={{ padding: "5px 12px", background: "#f3f4f6", color: "#374151", border: 0, borderRadius: 6, fontWeight: 600, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Annuler
                          </button>
                        </span>
                      ) : activeFilter === "actifs" ? (
                        <span style={{ display: "inline-flex", gap: 8 }}>
                          <button
                            type="button"
                            aria-label={`Basculer ${v.make} ${v.model} en ${v.lld ? "Vente" : "LLD"}`}
                            onClick={() => handleToggle(v)}
                            style={{ padding: "5px 14px", background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 6, fontWeight: 600, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            → {v.lld ? "Vente" : "LLD"}
                          </button>
                          <button
                            type="button"
                            aria-label={`Gérer les photos de ${v.make} ${v.model}`}
                            onClick={() => setPhotoTarget(v)}
                            style={{ padding: "5px 14px", background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 6, fontWeight: 600, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Photos
                          </button>
                          <button
                            type="button"
                            aria-label={`Modifier ${v.make} ${v.model}`}
                            onClick={() => openEdit(v)}
                            style={{ padding: "5px 14px", background: "var(--navy)", color: "#fff", border: 0, borderRadius: 6, fontWeight: 600, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            aria-label={`Supprimer ${v.make} ${v.model}`}
                            onClick={() => { setDeleteConfirmId(v.id); setDeleteError(""); }}
                            style={{ padding: "5px 14px", background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 6, fontWeight: 600, fontSize: ".82rem", cursor: "pointer" }}
                          >
                            Supprimer
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
