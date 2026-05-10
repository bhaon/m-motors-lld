"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";

export interface LldOptionRow {
  code: string;
  label: string;
  description: string;
  surcout_mensuel_ht: number;
  selected: boolean;
}

export type LldEditContext = "brouillon" | "contrat_actif" | "readonly";

export interface LldPricing {
  base_mensualite_ht: number | null;
  options_supplement_ht: number;
  total_mensualite_ht: number;
  editable: boolean;
  edit_context?: LldEditContext;
  items: LldOptionRow[];
}

interface LldOptionsSectionProps {
  dossierId: string;
  pricing: LldPricing;
  onPricingUpdated: (next: LldPricing) => void;
}

function selectionsFromItems(items: LldOptionRow[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const it of items) {
    m[it.code] = it.selected;
  }
  return m;
}

/**
 * Options LLD (US-07-01 souscription, US-07-02 contrat actif) : brouillon éditable,
 * contrat validé actif éditable avec confirmation du nouveau montant avant envoi.
 */
export default function LldOptionsSection({
  dossierId,
  pricing,
  onPricingUpdated,
}: Readonly<LldOptionsSectionProps>) {
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState("");
  /** Sélection en cours (non persistée tant que l'utilisateur n'a pas validé). */
  const [draftSelections, setDraftSelections] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setDraftSelections(selectionsFromItems(pricing.items));
  }, [pricing.items]);

  const dirty = useMemo(() => {
    const saved = selectionsFromItems(pricing.items);
    const codes = new Set([...Object.keys(saved), ...Object.keys(draftSelections)]);
    for (const c of codes) {
      if (!!saved[c] !== !!draftSelections[c]) return true;
    }
    return false;
  }, [pricing.items, draftSelections]);

  const supplementPreview = useMemo(() => {
    return pricing.items.reduce(
      (acc, it) => acc + (draftSelections[it.code] ? it.surcout_mensuel_ht : 0),
      0,
    );
  }, [pricing.items, draftSelections]);

  const totalPreview = useMemo(() => {
    const base = pricing.base_mensualite_ht ?? 0;
    return base + supplementPreview;
  }, [pricing.base_mensualite_ht, supplementPreview]);

  const persist = useCallback(
    async (nextSelections: Record<string, boolean>) => {
      setPending(true);
      setLocalError("");
      try {
        const res = await fetch(apiUrl(`/api/v1/dossiers/${dossierId}/options-lld`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selections: nextSelections }),
        });
        const payload = (await res.json().catch(() => ({}))) as LldPricing & { detail?: string };
        if (!res.ok) {
          throw new Error(payload.detail || "Enregistrement impossible.");
        }
        onPricingUpdated({
          base_mensualite_ht: payload.base_mensualite_ht ?? null,
          options_supplement_ht: payload.options_supplement_ht,
          total_mensualite_ht: payload.total_mensualite_ht,
          editable: payload.editable,
          edit_context: payload.edit_context,
          items: payload.items,
        });
        setConfirmOpen(false);
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Erreur réseau.");
      } finally {
        setPending(false);
      }
    },
    [dossierId, onPricingUpdated],
  );

  function toggle(code: string) {
    if (!pricing.editable || pending) return;
    setDraftSelections((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function formatEUR(n: number): string {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(n);
  }

  const editCtx = pricing.edit_context ?? "readonly";
  const savedTotal = pricing.total_mensualite_ht;

  return (
    <div
      id="lld-options-section"
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        boxShadow: "var(--shadow)",
      }}
    >
      <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", marginBottom: ".35rem", color: "var(--navy)" }}>
        Options de votre abonnement LLD
      </h2>
      <p style={{ margin: "0 0 1rem", fontSize: ".88rem", color: "var(--muted)", lineHeight: 1.5 }}>
        Personnalisez votre contrat : chaque option s&apos;ajoute au montant mensuel de base (HT).
        {pricing.editable && editCtx === "contrat_actif" && (
          <span>
            {" "}
            <strong>Contrat actif</strong> — vous pouvez adapter vos options à tout moment.
          </span>
        )}
      </p>

      {localError && (
        <p role="alert" style={{ color: "#b91c1c", marginBottom: ".75rem", fontSize: ".9rem" }}>
          {localError}
        </p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".65rem" }}>
        {pricing.items.map((it) => (
          <li
            key={it.code}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: ".75rem 1rem",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: ".75rem",
              alignItems: "start",
              opacity: pricing.editable ? 1 : 0.85,
            }}
          >
            <input
              type="checkbox"
              id={`lld-opt-${it.code}`}
              checked={!!draftSelections[it.code]}
              disabled={!pricing.editable || pending}
              onChange={() => toggle(it.code)}
              style={{ marginTop: 4, width: 18, height: 18, cursor: pricing.editable ? "pointer" : "not-allowed" }}
            />
            <label htmlFor={`lld-opt-${it.code}`} style={{ cursor: pricing.editable ? "pointer" : "default" }}>
              <span style={{ fontWeight: 600, color: "var(--navy)", display: "block" }}>{it.label}</span>
              <span style={{ fontSize: ".85rem", color: "var(--muted)", lineHeight: 1.45 }}>{it.description}</span>
            </label>
            <span style={{ fontWeight: 700, color: "#0C447C", whiteSpace: "nowrap", fontSize: ".9rem" }}>
              +{formatEUR(it.surcout_mensuel_ht)}
              <span style={{ fontWeight: 500, fontSize: ".75rem", color: "var(--muted)" }}> / mois HT</span>
            </span>
          </li>
        ))}
      </ul>

      <div
        style={{
          marginTop: "1.1rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: ".88rem", color: "var(--muted)" }}>
          Mensualité véhicule (HT) :{" "}
          <strong style={{ color: "var(--navy)" }}>
            {pricing.base_mensualite_ht != null ? formatEUR(pricing.base_mensualite_ht) : "—"}
          </strong>
        </div>
        <div style={{ fontSize: ".88rem", color: "var(--muted)" }}>
          Surcoût options (HT) : <strong style={{ color: "var(--navy)" }}>{formatEUR(supplementPreview)}</strong>
        </div>
        <div style={{ fontFamily: "Syne, sans-serif", fontSize: "1.05rem", color: "var(--navy)" }}>
          Total mensuel HT : <strong>{formatEUR(totalPreview)}</strong>
          {pending && <span style={{ marginLeft: 8, fontSize: ".8rem", color: "var(--muted)" }}>Enregistrement…</span>}
        </div>
      </div>

      {pricing.editable && dirty && (
        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            style={{
              background: "var(--navy)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: ".55rem 1.2rem",
              fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
              fontSize: ".9rem",
            }}
          >
            Enregistrer les modifications
          </button>
        </div>
      )}

      {!pricing.editable && (
        <p style={{ margin: ".85rem 0 0", fontSize: ".82rem", color: "var(--muted)" }}>
          {editCtx === "readonly"
            ? "Les options ne sont plus modifiables pour ce dossier (dossier non brouillon ou contrat terminé)."
            : null}
        </p>
      )}

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lld-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(0,0,0,.45)",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 420,
              width: "100%",
              padding: "1.25rem 1.5rem",
              boxShadow: "0 20px 50px rgba(0,0,0,.25)",
            }}
          >
            <h3 id="lld-confirm-title" style={{ margin: "0 0 .75rem", fontFamily: "Syne, sans-serif", color: "var(--navy)" }}>
              Confirmer la nouvelle mensualité
            </h3>
            <p style={{ margin: "0 0 1rem", fontSize: ".9rem", lineHeight: 1.5, color: "#374151" }}>
              Vous validez un total mensuel HT de <strong>{formatEUR(totalPreview)}</strong>
              {savedTotal !== totalPreview && (
                <>
                  {" "}
                  (anciennement {formatEUR(savedTotal)}).
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: ".75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                style={{
                  padding: ".45rem 1rem",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => persist(draftSelections)}
                disabled={pending}
                style={{
                  padding: ".45rem 1rem",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--navy)",
                  color: "#fff",
                  cursor: pending ? "wait" : "pointer",
                  fontWeight: 600,
                }}
              >
                {pending ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
