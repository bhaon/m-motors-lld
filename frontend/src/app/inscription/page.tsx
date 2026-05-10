"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Ancienne route « page » : redirige vers l’accueil où la Navbar ouvre la modale (onglet inscription).
 */
export default function InscriptionPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?inscription=1");
  }, [router]);
  return null;
}
