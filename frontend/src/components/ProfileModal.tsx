"use client";

import { useEffect, useState } from "react";
import ProfileManagementClient from "@/app/espace-client/ProfileManagementClient";
import { apiUrl } from "@/lib/api";

type CurrentUser = {
  id: number;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
};

export type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
  /** Après mise à jour du profil (nom / prénom), pour rafraîchir les initiales dans la navbar. */
  onProfileUpdated?: () => void;
};

/**
 * Modale « Mon profil » : charge l’utilisateur via `/auth/me` puis réutilise le formulaire existant.
 */
export default function ProfileModal({ open, onClose, onProfileUpdated }: ProfileModalProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setUser(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/v1/auth/me"), {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) {
            setError("Session expirée ou invalide.");
            onClose();
          }
          return;
        }
        const data = (await res.json()) as CurrentUser;
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) setError("Erreur réseau.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 520,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.25rem 1.5rem 1.5rem",
          boxShadow: "0 25px 60px rgba(0,0,0,.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h1 id="profile-modal-title" style={{ fontFamily: "Syne, sans-serif", fontSize: "1.25rem", margin: 0 }}>
            Mon profil
          </h1>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{
              border: 0,
              background: "transparent",
              fontSize: "1.5rem",
              lineHeight: 1,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ×
          </button>
        </div>

        {loading ? <p style={{ color: "#64748b" }}>Chargement…</p> : null}
        {error && !loading ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
        {!loading && user ? (
          <ProfileManagementClient initialUser={user} variant="modal" onProfileUpdated={onProfileUpdated} />
        ) : null}
      </div>
    </div>
  );
}
