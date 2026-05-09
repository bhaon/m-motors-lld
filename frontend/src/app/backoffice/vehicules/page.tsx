"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiBase } from "@/lib/api";
import { VehicleForm, VehicleBoItem, INITIAL_FORM, vehicleToForm } from "@/components/VehicleForm";
import PhotoModal from "@/components/PhotoModal";

// ── Type réponse toggle LLD ───────────────────────────────────────────────────

interface ToggleResponse {
  vehicle: { id: number; lld: boolean; mensualite: number | null };
  toggled: boolean;
  warning?: string;
  active_dossiers_count: number;
}

// ── URL helpers back-office ───────────────────────────────────────────────────

function urlBackoffice(archived = false) {
  return `${apiBase()}/api/v1/vehicules/backoffice${archived ? "?archived=true" : ""}`;
}
function urlRestaurer(id: number) { return `${apiBase()}/api/v1/vehicules/${id}/restaurer`; }
function urlVehicule(id: number) { return `${apiBase()}/api/v1/vehicules/${id}`; }
function urlToggleLld(id: number, confirm = false) {
  return `${apiBase()}/api/v1/vehicules/${id}/toggle-lld${confirm ? "?confirm=true" : ""}`;
}

// ── Composant Badge ──────────────────────────────────────────────────────────

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


// ── Modale add/edit véhicule ─────────────────────────────────────────────────

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
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3rem 1rem", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={ref} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.3)", width: "100%", maxWidth: 720, padding: "1.8rem 2rem 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.4rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--navy)" }}>{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: "1.4rem", color: "#6b7280", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
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
                      <Image
                        src={v.img}
                        alt={`${v.make} ${v.model}`}
                        width={64}
                        height={44}
                        unoptimized
                        style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
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
