"use client";

/**
 * Frontière d’erreur Next.js (fichier `error.tsx`) : affiche l’échec du rendu côté serveur ou client.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Catalogue indisponible</h1>
      <p className="text-neutral-600">{error.message}</p>
      <button
        type="button"
        className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
        onClick={reset}
      >
        Réessayer
      </button>
    </main>
  );
}
