"use client";

import { useState, useCallback } from "react";

/**
 * Gère l'affichage d'une notification temporaire (toast).
 *
 * Un seul message à la fois — suffisant pour les retours d'action du back-office.
 * Le message disparaît automatiquement après 3 secondes.
 *
 * @returns `toast` — état courant (message + visible), `showToast` — déclencheur.
 */
export function useToast() {
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }, []);

  return { toast, showToast };
}
