"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Vehicle } from "@/types";
import { useFilters } from "@/hooks/useFilters";
import { useToast } from "@/hooks/useToast";
import { useClientSession } from "@/hooks/useClientSession";
import SearchBar from "@/components/SearchBar";
import FiltersRow from "@/components/FiltersRow";
import VehicleCard from "@/components/VehicleCard";
import VehicleModal from "@/components/VehicleModal";
import DossierConfirmModal from "@/components/DossierConfirmModal";
import AuthModal from "@/components/AuthModal";
import Toast from "@/components/Toast";

interface CataloguePageProps {
  vehicles: Vehicle[];
}

/**
 * Bloc informatif lorsque l’API renvoie zéro véhicule (installation sans seed).
 */
function EmptyCatalogNotice() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "4rem 2rem",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.45 }}>
        📭
      </div>
      <h3
        style={{
          fontFamily: "Syne, sans-serif",
          fontSize: "1.25rem",
          color: "var(--navy)",
          marginBottom: "0.75rem",
        }}
      >
        Catalogue vide
      </h3>
      <p
        style={{ color: "var(--muted)", lineHeight: 1.6, marginBottom: "1rem" }}
      >
        Aucun véhicule n’est encore enregistré dans la base. Après une nouvelle
        installation, importez les données avec le script de peuplement côté
        backend&nbsp;: depuis le répertoire <code>backend</code>, exécutez{" "}
        <code style={{ fontSize: "0.9em" }}>python scripts/seed.py</code>{" "}
        (variables d’environnement habituelles : base de données,{" "}
        <code>SECRET_KEY</code>, etc.).
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Une fois le seed terminé, rechargez cette page pour afficher le
        catalogue.
      </p>
    </div>
  );
}

export default function CataloguePage({
  vehicles,
}: Readonly<CataloguePageProps>) {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [pendingDossier, setPendingDossier] = useState<{
    vehicle: Vehicle;
    type: "lld" | "achat";
  } | null>(null);
  const router = useRouter();
  const { filters, filtered, marques, modeles, setType, setField, reset } =
    useFilters(vehicles);
  const { toast, showToast } = useToast();
  const { sessionReady, isAuthenticated, refreshSession } = useClientSession();
  const [depositAuthOpen, setDepositAuthOpen] = useState(false);

  /**
   * Résout l'URL backend de création de dossier depuis le catalogue.
   */
  function resolveDossiersUrl(): string {
    const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
    const base = pub ? pub.replace(/\/$/, "") : "";
    return base ? `${base}/api/v1/dossiers` : "/api/v1/dossiers";
  }

  /**
   * Ouvre la confirmation de dépôt avant toute création effective.
   */
  function handleDossier(v: Vehicle, type: "lld" | "achat") {
    setSelectedVehicle(null);
    setPendingDossier({ vehicle: v, type });
  }

  /**
   * Annule la confirmation de dépôt sans créer de dossier.
   */
  function cancelPendingDossier() {
    setPendingDossier(null);
  }

  /**
   * Au clic sur « Confirmer le dépôt » : ouvre la connexion si besoin, sinon crée le dossier.
   */
  async function handleConfirmDepositClick() {
    if (!sessionReady || !pendingDossier) return;
    if (!isAuthenticated) {
      setDepositAuthOpen(true);
      return;
    }
    await confirmPendingDossier();
  }

  /**
   * Crée le dossier uniquement après confirmation explicite dans la modale.
   */
  async function confirmPendingDossier() {
    if (!pendingDossier) return;
    try {
      const response = await fetch(resolveDossiersUrl(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: pendingDossier.vehicle.id,
          type: pendingDossier.type,
        }),
      });
      const payload = (await response.json()) as {
        id?: number;
        reference?: string;
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Impossible de créer le dossier.");
      }
      const createdReference = payload.reference || "DOS-EN-ATTENTE";
      const createdId = Number(payload.id || 0);
      const typeLabel = pendingDossier.type.toUpperCase();
      setPendingDossier(null);
      const qs = new URLSearchParams({
        cree: "1",
        ref: createdReference,
        id: String(createdId),
        type: typeLabel,
      });
      router.push(`/mes-dossiers?${qs.toString()}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Erreur technique lors du dépôt.");
    }
  }

  const depositAuthModal = (
    <AuthModal
      open={depositAuthOpen}
      onClose={() => setDepositAuthOpen(false)}
      defaultTab="login"
      redirectAfterLogin={false}
      onAuthenticated={async () => {
        await refreshSession();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("m-motors-auth-session-changed"));
        }
      }}
    />
  );

  if (vehicles.length === 0) {
    return (
      <>
        <EmptyCatalogNotice />
        <VehicleModal
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          onDossier={handleDossier}
        />
        {depositAuthModal}
        <Toast message={toast.message} visible={toast.visible} />
      </>
    );
  }

  return (
    <>
      <SearchBar
        marques={marques}
        modeles={modeles}
        marque={filters.marque}
        modele={filters.modele}
        moteur={filters.moteur}
        kmMax={filters.kmMax}
        prixMax={filters.prixMax}
        onField={(field, value) =>
          setField(field as keyof typeof filters, value)
        }
        onSearch={() => {}}
      />

      <FiltersRow
        activeType={filters.type}
        count={filtered.length}
        onType={setType}
        onReset={reset}
      />

      {/* Grid — filtres sans résultat (le catalogue contient au moins un véhicule) */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem 2rem",
            color: "var(--muted)",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.4 }}>
            🔍
          </div>
          <h3
            style={{
              fontFamily: "Syne, sans-serif",
              fontSize: "1.1rem",
              color: "var(--navy)",
              marginBottom: ".5rem",
            }}
          >
            Aucun véhicule trouvé
          </h3>
          <p>Essayez d&apos;élargir vos critères de recherche</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1.25rem",
            padding: "0 2rem 3rem",
          }}
        >
          {filtered.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onClick={setSelectedVehicle} />
          ))}
        </div>
      )}

      <VehicleModal
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onDossier={handleDossier}
      />
      {pendingDossier ? (
        <DossierConfirmModal
          vehicle={pendingDossier.vehicle}
          type={pendingDossier.type}
          onConfirm={() => void handleConfirmDepositClick()}
          onCancel={cancelPendingDossier}
          confirmLocked={!sessionReady}
        />
      ) : null}

      {depositAuthModal}

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
