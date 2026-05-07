"use client";

import { FormEvent, useState } from "react";

type CurrentUser = {
  id: number;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
};

/**
 * Résout une URL d'API auth côté navigateur.
 */
function resolveAuthUrl(path: string): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}${path}` : path;
}

export default function ProfileManagementClient({ initialUser }: { initialUser: CurrentUser }) {
  const [profile, setProfile] = useState({
    first_name: initialUser.first_name,
    last_name: initialUser.last_name,
    phone: initialUser.phone ?? "",
    email: initialUser.email,
  });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  /**
   * Sauvegarde les informations du profil client.
   */
  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    try {
      const response = await fetch(resolveAuthUrl("/api/v1/auth/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile),
      });
      const payload = (await response.json()) as { message?: string; detail?: string };
      if (!response.ok) throw new Error(payload.detail || "Erreur lors de la sauvegarde.");
      setProfileMessage(payload.message || "Profil mis a jour avec succes.");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Erreur technique.");
    }
  }

  /**
   * Met à jour le mot de passe en imposant l'ancien mot de passe.
   */
  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    try {
      const response = await fetch(resolveAuthUrl("/api/v1/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const payload = (await response.json()) as { message?: string; detail?: string };
      if (!response.ok) throw new Error(payload.detail || "Erreur lors du changement de mot de passe.");
      setPasswordMessage(payload.message || "Mot de passe mis a jour avec succes.");
      setOldPassword("");
      setNewPassword("");
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Erreur technique.");
    }
  }

  return (
    <>
      <section style={{ maxWidth: 720, margin: "2rem auto", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Mon profil</h1>
        <p style={{ marginBottom: "1rem", color: "#4b5563" }}>
          Etat email: {initialUser.email_verified ? "verifie" : "a confirmer"}
        </p>
        <form onSubmit={onSaveProfile} style={{ display: "grid", gap: "0.9rem" }}>
          <input
            placeholder="Prenom"
            value={profile.first_name}
            onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
            required
          />
          <input placeholder="Nom" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} required />
          <input placeholder="Telephone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <input placeholder="Email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
          <button type="submit" style={{ background: "var(--navy)", color: "#fff", border: 0, padding: ".75rem", borderRadius: 8 }}>
            Sauvegarder le profil
          </button>
          {profileError ? <p style={{ color: "#b91c1c" }}>{profileError}</p> : null}
          {profileMessage ? <p style={{ color: "#166534" }}>{profileMessage}</p> : null}
        </form>
      </section>

      <section style={{ maxWidth: 720, margin: "1rem auto 2rem", padding: "1.5rem", background: "#fff", borderRadius: 12 }}>
        <h2 style={{ fontFamily: "Syne, sans-serif", marginBottom: "1rem" }}>Changer mon mot de passe</h2>
        <form onSubmit={onChangePassword} style={{ display: "grid", gap: "0.9rem" }}>
          <input
            placeholder="Ancien mot de passe"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
          <input
            placeholder="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button type="submit" style={{ background: "var(--navy)", color: "#fff", border: 0, padding: ".75rem", borderRadius: 8 }}>
            Mettre a jour le mot de passe
          </button>
          {passwordError ? <p style={{ color: "#b91c1c" }}>{passwordError}</p> : null}
          {passwordMessage ? <p style={{ color: "#166534" }}>{passwordMessage}</p> : null}
        </form>
      </section>
    </>
  );
}
