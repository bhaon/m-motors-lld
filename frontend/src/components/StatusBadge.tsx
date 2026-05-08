"use client";

import type { DossierStatus } from "@/types";

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

const STATUS_CONFIG: Record<DossierStatus, StatusConfig> = {
  brouillon:      { label: "Brouillon",       color: "#6b7280", bg: "#f3f4f6" },
  depose:         { label: "Déposé",          color: "#1d4ed8", bg: "#dbeafe" },
  en_instruction: { label: "En instruction",  color: "#b45309", bg: "#fef3c7" },
  valide:         { label: "Validé",          color: "#15803d", bg: "#dcfce7" },
  rejete:         { label: "Rejeté",          color: "#b91c1c", bg: "#fee2e2" },
  annule:         { label: "Annulé",          color: "#374151", bg: "#e5e7eb" },
};

interface StatusBadgeProps {
  status: DossierStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config: StatusConfig = STATUS_CONFIG[status] ?? {
    label: status,
    color: "#6b7280",
    bg: "#f3f4f6",
  };

  return (
    <span
      role="status"
      aria-label={`Statut : ${config.label}`}
      style={{
        display: "inline-block",
        padding: ".2rem .7rem",
        borderRadius: 20,
        fontSize: ".78rem",
        fontWeight: 600,
        letterSpacing: ".01em",
        color: config.color,
        background: config.bg,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}