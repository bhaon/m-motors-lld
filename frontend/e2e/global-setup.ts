/**
 * Démarre un serveur HTTP léger qui simule le backend FastAPI.
 * Utilisé par le Next.js SSR (API_INTERNAL_URL=http://localhost:8001)
 * et comme fallback pour les appels navigateur via les rewrites Next.js.
 *
 * Les tests individuels peuvent surcharger le comportement via page.route().
 */
import { createServer, IncomingMessage, ServerResponse } from "http";
import { MOCK_VEHICLES, MOCK_MARQUES, MOCK_LLD_CATALOG } from "./mock-data";

const MOCK_PORT = 8001;

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Cookie");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Catalogue véhicules (SSR page d'accueil)
  if (url.startsWith("/api/v1/vehicules/marques")) {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_MARQUES));
    return;
  }

  if (url.startsWith("/api/v1/vehicules") && !url.includes("/backoffice")) {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_VEHICLES));
    return;
  }

  // Catalogue LLD public
  if (url.startsWith("/api/v1/lld-catalog")) {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_LLD_CATALOG));
    return;
  }

  // Auth : non authentifié par défaut (les specs surchargent via page.route())
  if (url.startsWith("/api/v1/auth/me")) {
    res.writeHead(401);
    res.end(JSON.stringify({ detail: "Non authentifié" }));
    return;
  }

  if (url.startsWith("/api/v1/auth/")) {
    res.writeHead(200);
    res.end(JSON.stringify({ message: "ok" }));
    return;
  }

  // Dossiers : liste vide par défaut
  if (url.startsWith("/api/v1/dossiers/me")) {
    res.writeHead(200);
    res.end(JSON.stringify([]));
    return;
  }

  // Healthz
  if (url === "/api/healthz" || url === "/api/readyz") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ detail: "Not found" }));
}

export default async function globalSetup(): Promise<void> {
  const server = createServer(handleRequest);

  await new Promise<void>((resolve, reject) => {
    server.listen(MOCK_PORT, "127.0.0.1", resolve);
    server.on("error", reject);
  });

  // Stocke la référence pour le teardown
  (global as Record<string, unknown>).__MOCK_API_SERVER__ = server;

  console.log(`[mock-api] Serveur mock démarré sur http://localhost:${MOCK_PORT}`);
}
