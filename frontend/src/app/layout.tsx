// Importation du type Metadata depuis Next.js pour la configuration des métadonnées de la page
import type { Metadata } from "next";
// Importation des styles globaux de l'application
import "./globals.css";

// Définition des métadonnées globales de l'application (titre et description)
// Ces données seront utilisées pour le SEO et l'accessibilité
export const metadata: Metadata = {
  title: "M-Motors — Catalogue véhicules",
  description:
    "Achat et location longue durée de véhicules d'occasion — 100% dématérialisé",
};

// Définition du composant racine de la mise en page de l'application
// Il enveloppe l'ensemble du contenu de l'application dans la structure HTML de base
export default function RootLayout({
  children,
}: Readonly<{
  // Les enfants passés à la mise en page, typiquement le contenu de chaque page
  children: React.ReactNode;
}>) {
  return (
    // Déclaration de la langue principale du document (français)
    <html lang="fr">
      <body>
        {/* Insertion du contenu principal de la page */}
        {children}
      </body>
    </html>
  );
}
