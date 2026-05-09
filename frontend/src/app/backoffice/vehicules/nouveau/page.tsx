"use client";

/**
 * Page de création d'un véhicule (route standalone, accessible depuis la navbar).
 * Réutilise VehicleForm partagé avec le tableau de bord back-office.
 */

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { VehicleForm, VehicleBoItem, INITIAL_FORM } from "@/components/VehicleForm";

interface SuccessState {
  make: string;
  model: string;
  reference: string;
  message: string;
}

export default function NouveauVehiculePage() {
  const [success, setSuccess] = useState<SuccessState | null>(null);
  // Incrémenté à chaque succès pour forcer le remontage de VehicleForm et vider les champs
  const [formKey, setFormKey] = useState(0);

  function handleSuccess(vehicle: VehicleBoItem, _isNew: boolean, reference?: string, message?: string) {
    setSuccess({
      make: vehicle.make,
      model: vehicle.model,
      reference: reference ?? `#${vehicle.id}`,
      // Utilise le message renvoyé par l'API pour correspondre aux tests et éviter la répétition
      message: message ?? `Véhicule ajouté au catalogue avec succès.`,
    });
    setFormKey((k) => k + 1);
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <nav style={{ fontSize: ".82rem", color: "#6b7280", marginBottom: "1.2rem" }}>
          <Link href="/backoffice/vehicules" style={{ color: "var(--navy)", textDecoration: "none" }}>
            Gestion des véhicules
          </Link>
          {" / "}
          <span>Ajouter un véhicule</span>
        </nav>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--navy)", marginBottom: "1.5rem" }}>
          Ajouter un véhicule au catalogue
        </h1>

        {success && (
          <div
            role="status"
            aria-live="polite"
            style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 10, padding: "16px 20px", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ fontSize: "1.3rem" }}>✅</span>
            <div>
              <p style={{ fontWeight: 700, color: "#15803d", margin: 0 }}>{success.message}</p>
              <p style={{ color: "#166534", fontSize: ".85rem", margin: "4px 0 0" }}>
                Référence : <strong>{success.reference}</strong>
              </p>
            </div>
            <Link
              href="/backoffice/vehicules"
              style={{ marginLeft: "auto", fontSize: ".85rem", color: "var(--navy)", textDecoration: "underline" }}
            >
              Gérer les véhicules
            </Link>
          </div>
        )}

        <VehicleForm
          key={formKey}
          mode="add"
          initial={INITIAL_FORM}
          onSuccess={handleSuccess}
          onCancel={() => { /* handled by Annuler link below */ }}
        />

        {/* Remplacement du bouton Annuler interne par un lien de navigation */}
        <div style={{ marginTop: ".5rem", textAlign: "right" }}>
          <Link href="/" style={{ fontSize: ".88rem", color: "#6b7280", textDecoration: "underline" }}>
            Annuler
          </Link>
        </div>
      </main>
    </>
  );
}
