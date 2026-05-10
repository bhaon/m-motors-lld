"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Ancienne route « page » : redirige vers l’accueil où la Navbar ouvre la modale (onglet connexion).
 */
export default function ConnexionPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?connexion=1");
  }, [router]);
  return null;
}
