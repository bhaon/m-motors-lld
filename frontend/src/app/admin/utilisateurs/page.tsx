"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { apiUrl } from "@/lib/api";
import { validateAdminPassword } from "@/lib/validation";

type Role = "client" | "gestionnaire" | "superviseur" | "admin";

// Interface pour les utilisateurs administrateurs
interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
  email_verified: boolean;
  created_at: string | null;
}

// Interface pour le formulaire de création d'utilisateur
interface CreateForm {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Role;
}

// Formulaire initial
const INITIAL_FORM: CreateForm = {
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  role: "superviseur",
};

// Configuration des rôles
const ROLE_CONFIG: Record<Role, { label: string; color: string; bg: string }> = {
  client:       { label: "Client",       color: "#374151", bg: "#f3f4f6" },
  gestionnaire: { label: "Gestionnaire", color: "#1d4ed8", bg: "#dbeafe" },
  superviseur:  { label: "Superviseur",  color: "#6d28d9", bg: "#ede9fe" },
  admin:        { label: "Administrateur", color: "#b91c1c", bg: "#fee2e2" },
};

// Liste de tous les rôles
const ALL_ROLES: Role[] = ["client", "gestionnaire", "superviseur", "admin"];


// Composant pour afficher le badge du rôle
function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.client;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: ".78rem",
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

// Fonction pour formater la date
function formatDate(v: string | null): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v));
}

// Page d'administration des utilisateurs
export default function AdminUtilisateursPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Création d'utilisateur
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");

  // Changement de rôle d'un utilisateur
  const [pendingRole, setPendingRole] = useState<Record<number, Role>>({});
  const [savingRole, setSavingRole] = useState<number | null>(null);
  const [roleSuccess, setRoleSuccess] = useState<Record<number, string>>({});
  const [roleError, setRoleError] = useState("");

  // Suppression d'un utilisateur
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Fonction pour charger les utilisateurs
  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/v1/admin/users"), {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(p.detail || "Impossible de charger les utilisateurs.");
      }
      setUsers(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  // ── Création d'un utilisateur ──────────────────────────────────────────────────────

  // Fonction pour valider le formulaire de création d'utilisateur
  function validateForm(): boolean {
    // Initialisation des erreurs
    const errs: Partial<Record<keyof CreateForm, string>> = {};
    if (!form.email.trim() || !form.email.includes("@")) errs.email = "Email invalide.";
    if (!form.first_name.trim()) errs.first_name = "Prénom obligatoire.";
    if (!form.last_name.trim()) errs.last_name = "Nom obligatoire.";
    const pwdError = validateAdminPassword(form.password);
    if (pwdError) errs.password = pwdError;
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Fonction pour créer un utilisateur
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    if (!validateForm()) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl("/api/v1/admin/users"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(p.detail || "Erreur lors de la création.");
      }
      const data = (await res.json()) as { email: string; role: string; message: string };
      setCreateSuccess(data.message);
      setForm(INITIAL_FORM);
      setShowCreate(false);
      await loadUsers();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setCreating(false);
    }
  }

  // ── Changement de rôle d'un utilisateur ──────────────────────────────────────────────────────

  // Fonction pour enregistrer le nouveau rôle d'un utilisateur
  async function handleSaveRole(userId: number) {
    // Récupération du nouveau rôle
    const newRole = pendingRole[userId];
    if (!newRole) return;
    setSavingRole(userId);
    // Enregistrement du nouveau rôle
    try {
      const res = await fetch(apiUrl(`/api/v1/admin/users/${userId}/role`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      // Vérification de la réponse
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(p.detail || "Erreur lors de la mise à jour.");
      }
      // Mise à jour des utilisateurs
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      setPendingRole((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      setRoleSuccess((prev) => ({ ...prev, [userId]: "Rôle mis à jour." }));
      setTimeout(() => setRoleSuccess((prev) => { const n = { ...prev }; delete n[userId]; return n; }), 2500);
    } catch (e: unknown) {
      setRoleError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setSavingRole(null);
    }
  }

  // ── Suppression d'un utilisateur ──────────────────────────────────────────────────────

  // Fonction pour supprimer un utilisateur
  async function handleDelete(userId: number) {
    setDeleting(userId);
    try {
      const res = await fetch(apiUrl(`/api/v1/admin/users/${userId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const p = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(p.detail || "Erreur lors de la suppression.");
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDeleteId(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setDeleting(null);
    }
  }

  // Styles pour les inputs
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 7,
    fontSize: ".88rem",
    boxSizing: "border-box",
  };

  // Styles pour les labels
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 600,
    fontSize: ".82rem",
    color: "#374151",
    marginBottom: 3,
  };

  // Fonction pour compter les utilisateurs par rôle
  const countByRole = (r: Role) => users.filter((u) => u.role === r).length;

  return (
    // Page d'administration des utilisateurs
    <>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.4rem", flexWrap: "wrap", gap: "1rem" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--navy)", margin: 0 }}>
            Gestion des utilisateurs
          </h1>
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setCreateError(""); setCreateSuccess(""); setForm(INITIAL_FORM); setFormErrors({}); }}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              background: showCreate ? "#e5e7eb" : "var(--navy)",
              color: showCreate ? "#374151" : "#fff",
              border: 0,
              fontWeight: 700,
              fontSize: ".88rem",
              cursor: "pointer",
            }}
          >
            {showCreate ? "✕ Annuler" : "+ Nouvel utilisateur"}
          </button>
        </div>

        {/* Compteurs par rôle */}
        {!loading && !error && (
          <div style={{ display: "flex", gap: "0.8rem", marginBottom: "1.4rem", flexWrap: "wrap" }}>
            {ALL_ROLES.map((r) => (
              <div key={r} style={{ background: ROLE_CONFIG[r].bg, borderRadius: 8, padding: "8px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: ROLE_CONFIG[r].color, fontSize: ".88rem" }}>{countByRole(r)}</span>
                <span style={{ color: ROLE_CONFIG[r].color, fontSize: ".82rem" }}>{ROLE_CONFIG[r].label}</span>
              </div>
            ))}
            <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 16px", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#374151", fontSize: ".88rem" }}>{users.length}</span>
              <span style={{ color: "#6b7280", fontSize: ".82rem" }}>Total</span>
            </div>
          </div>
        )}

        {/* Message de succès création */}
        {createSuccess && (
          <div role="status" aria-live="polite" style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: "1rem", color: "#15803d", fontWeight: 600 }}>
            ✅ {createSuccess}
          </div>
        )}

        {/* Formulaire création */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            aria-label="Formulaire de création d'utilisateur"
            data-testid="create-user-form"
            style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.4rem", marginBottom: "1.5rem" }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy)", marginTop: 0, marginBottom: "1.1rem" }}>
              Créer un compte utilisateur
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem 1.4rem" }}>
              <div>
                <label htmlFor="new-firstname" style={labelStyle}>Prénom *</label>
                <input id="new-firstname" data-testid="field-firstname" type="text" value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} style={inputStyle} />
                {formErrors.first_name && <p style={{ color: "#b91c1c", fontSize: ".78rem", margin: "3px 0 0" }}>{formErrors.first_name}</p>}
              </div>
              <div>
                <label htmlFor="new-lastname" style={labelStyle}>Nom *</label>
                <input id="new-lastname" data-testid="field-lastname" type="text" value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} style={inputStyle} />
                {formErrors.last_name && <p style={{ color: "#b91c1c", fontSize: ".78rem", margin: "3px 0 0" }}>{formErrors.last_name}</p>}
              </div>
              <div>
                <label htmlFor="new-email" style={labelStyle}>Email *</label>
                <input id="new-email" data-testid="field-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} style={inputStyle} />
                {formErrors.email && <p style={{ color: "#b91c1c", fontSize: ".78rem", margin: "3px 0 0" }}>{formErrors.email}</p>}
              </div>
              <div>
                <label htmlFor="new-password" style={labelStyle}>Mot de passe *</label>
                <input id="new-password" data-testid="field-password" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} style={inputStyle} placeholder="8 car., 1 maj., 1 chiffre, 1 spécial" />
                {formErrors.password && <p style={{ color: "#b91c1c", fontSize: ".78rem", margin: "3px 0 0" }}>{formErrors.password}</p>}
              </div>
              <div>
                <label htmlFor="new-role" style={labelStyle}>Rôle *</label>
                <select id="new-role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))} style={inputStyle}>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                  ))}
                </select>
              </div>
            </div>
            {createError && (
              <p role="alert" style={{ color: "#b91c1c", fontWeight: 600, margin: "0.8rem 0 0", fontSize: ".88rem" }}>
                {createError}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem", gap: "0.8rem" }}>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: ".88rem", cursor: "pointer" }}>
                Annuler
              </button>
              <button type="submit" disabled={creating} style={{ padding: "8px 22px", borderRadius: 7, background: creating ? "#94a3b8" : "var(--navy)", color: "#fff", border: 0, fontWeight: 700, fontSize: ".88rem", cursor: creating ? "not-allowed" : "pointer" }}>
                {creating ? "Création…" : "Créer le compte"}
              </button>
            </div>
          </form>
        )}

        {/* Erreur globale */}
        {error && (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 600, marginBottom: "1rem" }}>{error}</p>
        )}

        {/* Tableau */}
        {loading ? (
          <p aria-live="polite">Chargement des utilisateurs…</p>
        ) : users.length === 0 ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: "2rem" }}>Aucun utilisateur.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left", fontWeight: 700, color: "#374151" }}>
                  <th style={{ padding: "10px 14px" }}>Utilisateur</th>
                  <th style={{ padding: "10px 14px" }}>Email</th>
                  <th style={{ padding: "10px 14px" }}>Rôle actuel</th>
                  <th style={{ padding: "10px 14px" }}>Modifier le rôle</th>
                  <th style={{ padding: "10px 14px" }}>Vérifié</th>
                  <th style={{ padding: "10px 14px" }}>Créé le</th>
                  <th style={{ padding: "10px 14px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const selected = pendingRole[u.id] ?? u.role;
                  const isDirty = pendingRole[u.id] !== undefined && pendingRole[u.id] !== u.role;
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                        {u.first_name} {u.last_name}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#4b5563", fontFamily: "monospace", fontSize: ".83rem" }}>
                        {u.email}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <RoleBadge role={u.role} />
                        {roleSuccess[u.id] && (
                          <span style={{ marginLeft: 8, fontSize: ".75rem", color: "#15803d" }}>✓ {roleSuccess[u.id]}</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <select
                            aria-label={`Changer le rôle de ${u.first_name} ${u.last_name}`}
                            value={selected}
                            onChange={(e) => setPendingRole((prev) => ({ ...prev, [u.id]: e.target.value as Role }))}
                            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: ".82rem" }}
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                            ))}
                          </select>
                          {isDirty && (
                            <button
                              type="button"
                              disabled={savingRole === u.id}
                              onClick={() => handleSaveRole(u.id)}
                              aria-label={`Enregistrer le nouveau rôle de ${u.first_name} ${u.last_name}`}
                              style={{ padding: "5px 10px", borderRadius: 6, background: "var(--navy)", color: "#fff", border: 0, fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
                            >
                              {savingRole === u.id ? "…" : "Enregistrer"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        {u.email_verified ? (
                          <span title="Email vérifié" style={{ color: "#15803d" }}>✓</span>
                        ) : (
                          <span title="Email non vérifié" style={{ color: "#9ca3af" }}>–</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {formatDate(u.created_at)}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        {confirmDeleteId === u.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: ".78rem", color: "#b91c1c", fontWeight: 600 }}>Confirmer ?</span>
                            <button
                              type="button"
                              disabled={deleting === u.id}
                              onClick={() => handleDelete(u.id)}
                              aria-label={`Confirmer la suppression de ${u.first_name} ${u.last_name}`}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "#b91c1c", color: "#fff", border: 0, fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
                            >
                              {deleting === u.id ? "…" : "Oui"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              style={{ padding: "4px 10px", borderRadius: 6, background: "#e5e7eb", color: "#374151", border: 0, fontSize: ".78rem", cursor: "pointer" }}
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(u.id)}
                            aria-label={`Supprimer ${u.first_name} ${u.last_name}`}
                            style={{ padding: "5px 12px", borderRadius: 6, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
                          >
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Erreurs inline à la place des alert() */}
        {roleError && (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 600, marginTop: "1rem" }}>
            Erreur rôle : {roleError}
          </p>
        )}
        {deleteError && (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 600, marginTop: "1rem" }}>
            Erreur suppression : {deleteError}
          </p>
        )}
      </main>
    </>
  );
}
