"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const MOTEURS = ["Essence", "Diesel", "Hybride", "Électrique"] as const;
const BOITES = ["Manuelle", "Automatique", "CVT"] as const;

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

function resolveCreerUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/vehicules/creer` : "/api/v1/vehicules/creer";
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ color: "#b91c1c", fontSize: ".82rem", marginTop: 4 }}>
      {message}
    </p>
  );
}

export default function NouveauVehiculePage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: number; reference: string; message: string } | null>(
    null,
  );
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
    setSuccess(null);
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

      const res = await fetch(resolveCreerUrl(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Erreur lors de la création du véhicule.");
      }

      const data = (await res.json()) as { id: number; reference: string; message: string };
      setSuccess(data);
      setForm(INITIAL_FORM);
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

  const groupStyle: React.CSSProperties = { marginBottom: "1.1rem" };

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <nav style={{ fontSize: ".82rem", color: "#6b7280", marginBottom: "1.2rem" }}>
          <Link href="/" style={{ color: "var(--navy)", textDecoration: "none" }}>
            Catalogue
          </Link>
          {" / "}
          <span>Ajouter un véhicule</span>
        </nav>

        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            color: "var(--navy)",
            marginBottom: "1.5rem",
          }}
        >
          Ajouter un véhicule au catalogue
        </h1>

        {success && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: "#dcfce7",
              border: "1px solid #bbf7d0",
              borderRadius: 10,
              padding: "16px 20px",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: "1.3rem" }}>✅</span>
            <div>
              <p style={{ fontWeight: 700, color: "#15803d", margin: 0 }}>{success.message}</p>
              <p style={{ color: "#166534", fontSize: ".85rem", margin: "4px 0 0" }}>
                Référence : <strong>{success.reference}</strong>
              </p>
            </div>
            <Link
              href={`/api/v1/vehicules/${success.id}`}
              style={{
                marginLeft: "auto",
                fontSize: ".85rem",
                color: "var(--navy)",
                textDecoration: "underline",
              }}
            >
              Voir la fiche
            </Link>
          </div>
        )}

        {apiError && (
          <p role="alert" style={{ color: "#b91c1c", marginBottom: "1rem", fontWeight: 600 }}>
            {apiError}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Identité ─────────────────────────────── */}
          <fieldset
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "1.2rem 1.4rem",
              marginBottom: "1.4rem",
            }}
          >
            <legend
              style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--navy)", padding: "0 6px" }}
            >
              Identité du véhicule
            </legend>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1.2rem" }}>
              <div style={groupStyle}>
                <label htmlFor="make" style={labelStyle}>
                  Marque *
                </label>
                <input
                  id="make"
                  type="text"
                  value={form.make}
                  onChange={(e) => set("make", e.target.value)}
                  placeholder="ex : Renault"
                  style={inputStyle}
                  aria-describedby={errors.make ? "make-err" : undefined}
                />
                <FieldError message={errors.make} />
              </div>

              <div style={groupStyle}>
                <label htmlFor="model" style={labelStyle}>
                  Modèle *
                </label>
                <input
                  id="model"
                  type="text"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="ex : Clio"
                  style={inputStyle}
                />
                <FieldError message={errors.model} />
              </div>

              <div style={groupStyle}>
                <label htmlFor="year" style={labelStyle}>
                  Année *
                </label>
                <input
                  id="year"
                  type="number"
                  min={2000}
                  max={2030}
                  value={form.year}
                  onChange={(e) => set("year", e.target.value)}
                  placeholder="ex : 2024"
                  style={inputStyle}
                />
                <FieldError message={errors.year} />
              </div>

              <div style={groupStyle}>
                <label htmlFor="moteur" style={labelStyle}>
                  Motorisation *
                </label>
                <select
                  id="moteur"
                  value={form.moteur}
                  onChange={(e) => set("moteur", e.target.value)}
                  style={inputStyle}
                >
                  {MOTEURS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div style={groupStyle}>
                <label htmlFor="km" style={labelStyle}>
                  Kilométrage *
                </label>
                <input
                  id="km"
                  type="number"
                  min={0}
                  value={form.km}
                  onChange={(e) => set("km", e.target.value)}
                  placeholder="ex : 12000"
                  style={inputStyle}
                />
                <FieldError message={errors.km} />
              </div>

              <div style={groupStyle}>
                <label htmlFor="spec_couleur" style={labelStyle}>
                  Couleur *
                </label>
                <input
                  id="spec_couleur"
                  type="text"
                  value={form.spec_couleur}
                  onChange={(e) => set("spec_couleur", e.target.value)}
                  placeholder="ex : Blanc nacré"
                  style={inputStyle}
                />
                <FieldError message={errors.spec_couleur} />
              </div>

              <div style={groupStyle}>
                <label htmlFor="spec_boite" style={labelStyle}>
                  Boîte de vitesses *
                </label>
                <select
                  id="spec_boite"
                  value={form.spec_boite}
                  onChange={(e) => set("spec_boite", e.target.value)}
                  style={inputStyle}
                >
                  {BOITES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div style={groupStyle}>
                <label htmlFor="spec_puissance" style={labelStyle}>
                  Puissance *
                </label>
                <input
                  id="spec_puissance"
                  type="text"
                  value={form.spec_puissance}
                  onChange={(e) => set("spec_puissance", e.target.value)}
                  placeholder="ex : 130 ch"
                  style={inputStyle}
                />
                <FieldError message={errors.spec_puissance} />
              </div>

              <div style={groupStyle}>
                <label htmlFor="spec_places" style={labelStyle}>
                  Nombre de places
                </label>
                <input
                  id="spec_places"
                  type="number"
                  min={1}
                  max={9}
                  value={form.spec_places}
                  onChange={(e) => set("spec_places", e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </fieldset>

          {/* ── Tarification ─────────────────────────── */}
          <fieldset
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "1.2rem 1.4rem",
              marginBottom: "1.4rem",
            }}
          >
            <legend
              style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--navy)", padding: "0 6px" }}
            >
              Tarification
            </legend>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1.2rem" }}>
              <div style={groupStyle}>
                <label htmlFor="prix" style={labelStyle}>
                  Prix de vente HT * (€)
                </label>
                <input
                  id="prix"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.prix}
                  onChange={(e) => set("prix", e.target.value)}
                  placeholder="ex : 19990"
                  style={inputStyle}
                />
                <FieldError message={errors.prix} />
              </div>

              <div style={groupStyle}>
                <label style={labelStyle}>Type de contrat *</label>
                <div style={{ display: "flex", gap: "1.2rem", alignItems: "center", height: 40 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="lld"
                      value="achat"
                      checked={!form.lld}
                      onChange={() => set("lld", false)}
                    />
                    <span style={{ fontSize: ".9rem" }}>Achat</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="lld"
                      value="lld"
                      checked={form.lld}
                      onChange={() => set("lld", true)}
                    />
                    <span style={{ fontSize: ".9rem" }}>LLD</span>
                  </label>
                </div>
              </div>

              {form.lld && (
                <div style={groupStyle}>
                  <label htmlFor="mensualite" style={labelStyle}>
                    Mensualité LLD HT * (€/mois)
                  </label>
                  <input
                    id="mensualite"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.mensualite}
                    onChange={(e) => set("mensualite", e.target.value)}
                    placeholder="ex : 299"
                    style={inputStyle}
                  />
                  <FieldError message={errors.mensualite} />
                </div>
              )}
            </div>
          </fieldset>

          {/* ── Photo ────────────────────────────────── */}
          <fieldset
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "1.2rem 1.4rem",
              marginBottom: "1.4rem",
            }}
          >
            <legend
              style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--navy)", padding: "0 6px" }}
            >
              Photo
            </legend>

            <div style={groupStyle}>
              <label htmlFor="img" style={labelStyle}>
                URL photo principale *
              </label>
              <input
                id="img"
                type="url"
                value={form.img}
                onChange={(e) => set("img", e.target.value)}
                placeholder="https://example.com/photo.jpg"
                style={inputStyle}
              />
              <FieldError message={errors.img} />
              {form.img.trim() && (
                <img
                  src={form.img.trim()}
                  alt="Aperçu photo principale"
                  style={{
                    marginTop: 10,
                    maxHeight: 160,
                    maxWidth: "100%",
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
          </fieldset>

          {/* ── Publication ──────────────────────────── */}
          <fieldset
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "1.2rem 1.4rem",
              marginBottom: "2rem",
            }}
          >
            <legend
              style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--navy)", padding: "0 6px" }}
            >
              Publication
            </legend>

            <label
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={form.visible_catalogue}
                onChange={(e) => set("visible_catalogue", e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: ".9rem", color: "#374151" }}>
                Rendre visible dans le catalogue dès la création
              </span>
            </label>
          </fieldset>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
            <Link
              href="/"
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                color: "#374151",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: ".9rem",
              }}
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "10px 28px",
                borderRadius: 8,
                background: submitting ? "#94a3b8" : "var(--navy)",
                color: "#fff",
                border: 0,
                fontWeight: 700,
                fontSize: ".9rem",
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Enregistrement…" : "Ajouter au catalogue"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
