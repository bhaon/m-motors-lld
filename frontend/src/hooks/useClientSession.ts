"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Résout l'URL `/auth/me` côté navigateur (même logique que la barre de navigation).
 */
function resolveMeUrl(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = pub ? pub.replace(/\/$/, "") : "";
  return base ? `${base}/api/v1/auth/me` : "/api/v1/auth/me";
}

/** Indique si le JSON `/me` décrit un utilisateur connecté (objet avec `id` numérique). */
function isSessionUserPayload(data: unknown): data is { id: number } {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    "id" in data &&
    typeof (data as { id: unknown }).id === "number"
  );
}

/**
 * Lit la session cookie via `/api/v1/auth/me` et expose un rafraîchissement après login.
 */
export function useClientSession() {
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch(resolveMeUrl(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setIsAuthenticated(false);
        return;
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        setIsAuthenticated(false);
        return;
      }
      setIsAuthenticated(isSessionUserPayload(data));
    } catch {
      setIsAuthenticated(false);
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  return { sessionReady, isAuthenticated, refreshSession };
}
