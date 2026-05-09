"use client";

/**
 * Modale de gestion des photos d'un véhicule (back-office gestionnaire).
 * 3 onglets :
 * - Galerie  : visualiser, réordonner, définir la photo principale, supprimer.
 * - Uploader : envoyer des fichiers JPG/PNG vers MinIO (flux init→PUT→complete).
 * - Bibliothèque : réutiliser une photo déjà uploadée pour un autre véhicule.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiBase } from "@/lib/api";
import type { VehicleBoItem } from "@/components/VehicleForm";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── URL helpers (internes au composant) ───────────────────────────────────────

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 Mo

function urlPhotos(id: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos`; }
function urlPhotoMain(id: number, pid: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos/${pid}/principal`; }
function urlPhotoDelete(id: number, pid: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos/${pid}`; }
function urlPhotoReorder(id: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos/reordonner`; }
function urlPhotoUploadInit(id: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos/upload-init`; }
function urlPhotoUploadComplete(id: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos/upload-complete`; }
function urlPhotoLibrary() { return `${apiBase()}/api/v1/vehicules/photos/bibliotheque`; }
function urlPhotoFromLibrary(id: number) { return `${apiBase()}/api/v1/vehicules/${id}/photos/depuis-bibliotheque`; }

// ── Sous-composant Modal générique ────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.3)", width: "100%", maxWidth: 720, padding: "1.8rem 2rem 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.4rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--navy)" }}>{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: "1.4rem", color: "#6b7280", lineHeight: 1 }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface PhotoModalProps {
  vehicle: VehicleBoItem;
  onClose: () => void;
}

export default function PhotoModal({ vehicle, onClose }: PhotoModalProps) {
  const [activeTab, setActiveTab] = useState<"galerie" | "upload" | "bibliotheque">("galerie");

  // État galerie
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [orderEdits, setOrderEdits] = useState<Record<number, string>>({});

  // État upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<{ total: number; done: number; current: string; error: string }>(
    { total: 0, done: 0, current: "", error: "" }
  );
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  // État bibliothèque
  const [library, setLibrary] = useState<LibraryPhoto[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── Chargement galerie ─────────────────────────────────────────────────────

  useEffect(() => {
    fetch(urlPhotos(vehicle.id), { credentials: "include" })
      .then((r) => r.json())
      .then((data: PhotoItem[]) => { setPhotos(data); setGalleryLoading(false); })
      .catch(() => setGalleryLoading(false));
  }, [vehicle.id]);

  // ── Actions galerie ────────────────────────────────────────────────────────

  async function handleSetMain(photoId: number) {
    const res = await fetch(urlPhotoMain(vehicle.id, photoId), { method: "PATCH", credentials: "include" });
    if (res.ok) setPhotos(await res.json());
  }

  async function handleDelete(photoId: number) {
    const res = await fetch(urlPhotoDelete(vehicle.id, photoId), { method: "DELETE", credentials: "include" });
    if (res.ok || res.status === 204) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setDeleteConfirm(null);
    }
  }

  async function handleReorder() {
    const payload = photos
      .filter((p) => orderEdits[p.id] !== undefined)
      .map((p) => ({ id: p.id, order: parseInt(orderEdits[p.id] ?? String(p.order), 10) }));
    if (!payload.length) return;
    const res = await fetch(urlPhotoReorder(vehicle.id), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos: payload }),
    });
    if (res.ok) { setPhotos(await res.json()); setOrderEdits({}); }
  }

  // ── Actions upload ─────────────────────────────────────────────────────────

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
    for (const file of selectedFiles) {
      setUploadState((s) => ({ ...s, current: file.name }));
      try {
        // 1. URL pré-signée
        const initRes = await fetch(urlPhotoUploadInit(vehicle.id), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content_type: file.type, file_size: file.size }),
        });
        if (!initRes.ok) throw new Error("Impossible d'initialiser l'upload.");
        const { upload_url, object_key } = (await initRes.json()) as { upload_url: string; object_key: string };

        // 2. Envoi direct MinIO
        const putRes = await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!putRes.ok) throw new Error(`Upload MinIO échoué pour ${file.name}.`);

        // 3. Confirmation en base
        const completeRes = await fetch(urlPhotoUploadComplete(vehicle.id), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ object_key }),
        });
        if (!completeRes.ok) throw new Error("Confirmation d'upload échouée.");
        setPhotos((await completeRes.json()) as PhotoItem[]);
        setUploadState((s) => ({ ...s, done: s.done + 1 }));
      } catch (err: unknown) {
        setUploadState((s) => ({ ...s, error: err instanceof Error ? err.message : "Erreur inattendue." }));
        break;
      }
    }
    setSelectedFiles([]);
    setUploadState((s) => {
      if (s.error) return s;
      setActiveTab("galerie");
      return { ...s, current: "", total: 0, done: 0 };
    });
  }

  // ── Actions bibliothèque ───────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "bibliotheque") return;
    setLibraryLoading(true);
    fetch(urlPhotoLibrary(), { credentials: "include" })
      .then((r) => r.json())
      .then((data: LibraryPhoto[]) => {
        // Exclure les photos déjà associées à ce véhicule
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
    if (res.ok) { setPhotos((await res.json()) as PhotoItem[]); setActiveTab("galerie"); }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const tabBtn = (tab: typeof activeTab, label: string) => (
    <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}
      style={{ padding: "7px 18px", border: 0, borderRadius: "7px 7px 0 0", background: activeTab === tab ? "var(--navy)" : "#f1f5f9", color: activeTab === tab ? "#fff" : "#374151", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <Modal title={`Photos — ${vehicle.make} ${vehicle.model}`} onClose={onClose}>
      {/* Onglets */}
      <div style={{ display: "flex", gap: ".4rem", marginBottom: "1.2rem", borderBottom: "2px solid #e5e7eb", paddingBottom: ".4rem" }}>
        {tabBtn("galerie", `Galerie (${photos.length})`)}
        {tabBtn("upload", "Uploader")}
        {tabBtn("bibliotheque", "Bibliothèque")}
      </div>

      {/* ── Galerie ── */}
      {activeTab === "galerie" && (
        galleryLoading ? <p style={{ color: "#6b7280" }}>Chargement…</p> : (
          <>
            {photos.length === 0 ? (
              <p style={{ color: "#6b7280", marginBottom: "1rem" }}>Aucune photo. Utilisez l&apos;onglet <strong>Uploader</strong>.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: ".8rem", marginBottom: "1.2rem" }}>
                {photos.map((p) => (
                  <div key={p.id} style={{ border: p.is_main ? "2px solid #0e7490" : "1px solid #e5e7eb", borderRadius: 9, overflow: "hidden", background: "#f9fafb" }}>
                    <Image src={p.url} alt={`Photo ${p.id}`} aria-label={`Photo ${p.id}`} width={320} height={80} unoptimized
                      style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
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

      {/* ── Upload ── */}
      {activeTab === "upload" && (
        <div>
          <label style={{ display: "block", fontWeight: 600, fontSize: ".85rem", color: "#374151", marginBottom: 8 }}>
            Sélectionner des fichiers (JPG ou PNG, max 5 Mo par photo)
          </label>
          <input type="file" accept="image/jpeg,image/jpg,image/png" multiple aria-label="Sélectionner des photos"
            onChange={handleFilePick} style={{ display: "block", marginBottom: 8, fontSize: ".88rem" }} />
          {fileErrors.length > 0 && (
            <div role="alert" style={{ background: "#fee2e2", borderRadius: 7, padding: "8px 12px", marginBottom: 8 }}>
              {fileErrors.map((e, i) => <p key={i} style={{ margin: 0, fontSize: ".82rem", color: "#b91c1c" }}>{e}</p>)}
            </div>
          )}
          {selectedFiles.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: ".85rem", color: "#374151", marginBottom: 4 }}>{selectedFiles.length} fichier(s) sélectionné(s) :</p>
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
          <button type="button" aria-label="Uploader les photos sélectionnées" onClick={handleUpload}
            disabled={!selectedFiles.length || uploadState.total > uploadState.done}
            style={{ padding: "9px 22px", background: !selectedFiles.length ? "#94a3b8" : "var(--navy)", color: "#fff", border: 0, borderRadius: 7, fontWeight: 700, fontSize: ".9rem", cursor: !selectedFiles.length ? "not-allowed" : "pointer" }}>
            {uploadState.total > uploadState.done ? "Upload en cours…" : "Uploader"}
          </button>
        </div>
      )}

      {/* ── Bibliothèque ── */}
      {activeTab === "bibliotheque" && (
        libraryLoading ? <p style={{ color: "#6b7280" }}>Chargement…</p> :
          library.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Aucune photo disponible dans la bibliothèque.</p>
          ) : (
            <div>
              <p style={{ fontSize: ".85rem", color: "#6b7280", marginBottom: "1rem" }}>
                Cliquez sur une photo pour l&apos;ajouter à la galerie de ce véhicule.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: ".8rem" }}>
                {library.map((p) => (
                  <button key={p.id} type="button" aria-label={`Ajouter la photo ${p.id} du ${p.vehicle_make} ${p.vehicle_model}`}
                    onClick={() => handleAddFromLibrary(p.id)}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 9, overflow: "hidden", background: "#f9fafb", cursor: "pointer", padding: 0, textAlign: "left" }}>
                    <Image src={p.url} alt={`${p.vehicle_make} ${p.vehicle_model}`} width={320} height={80} unoptimized
                      style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: "4px 6px" }}>
                      <span style={{ fontSize: ".7rem", color: "#374151", fontWeight: 600 }}>{p.vehicle_make} {p.vehicle_model}</span>
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
