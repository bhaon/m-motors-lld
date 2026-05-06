// Importation de la barre de navigation principale du site
import Navbar from "@/components/Navbar";
// Importation du composant Hero (en-tête visuel principal)
import Hero from "@/components/Hero";
// Importation du composant de page du catalogue des véhicules
import CataloguePage from "@/components/CataloguePage";
// Importation de la fonction pour récupérer la liste des véhicules depuis l'API ou la base de données
import { fetchVehicles } from "./fetchVehicles";

/**
 * Rendu à la requête uniquement : le catalogue est lu sur l’API à chaque visite.
 * Sans cela, `next build` tenterait un prérendu statique alors que le backend n’existe pas pendant l’image Docker.
 */
export const dynamic = "force-dynamic";

// Définition du composant de page d'accueil (Next.js — Fonction asynchrone car elle attend une ressource distante)
export default async function Home() {
  // Récupération asynchrone de la liste des véhicules à afficher dans le catalogue
  const vehicles = await fetchVehicles();

  // Rendu du contenu principal de la page
  return (
    <main>
      {/* Affichage de la barre de navigation */}
      <Navbar />
      {/* Affichage du bloc "Hero" avec le nombre de véhicules dynamiquement injecté */}
      <Hero vehicleCount={vehicles.length} />
      {/* Affichage du catalogue avec la liste des véhicules obtenue */}
      <CataloguePage vehicles={vehicles} />
    </main>
  );
}
