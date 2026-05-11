import { Server } from "http";

export default async function globalTeardown(): Promise<void> {
  const server = (global as Record<string, unknown>).__MOCK_API_SERVER__ as Server | undefined;
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    console.log("[mock-api] Serveur mock arrêté.");
  }
}
