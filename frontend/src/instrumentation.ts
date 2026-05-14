import { registerOTel } from "@vercel/otel";

/**
 * Convention Next.js : enregistre l’OpenTelemetry côté serveur Node (traces, fetch, OTLP via variables d’environnement).
 */
export function register(): void {
  if (isOtelSdkDisabled()) {
    return;
  }
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "mmotors-frontend",
  });
}

/** Respecte OTEL_SDK_DISABLED pour les tests ou environnements sans collecteur. */
function isOtelSdkDisabled(): boolean {
  const v = process.env.OTEL_SDK_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
