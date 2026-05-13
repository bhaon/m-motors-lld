import { defineConfig, devices } from "@playwright/test";

/**
 * Configuration Playwright E2E.
 *
 * Architecture mock :
 * - global-setup  → démarre un serveur HTTP mock sur :8001 (simule le backend FastAPI)
 * - webServer     → démarre `next build && next start` avec API_INTERNAL_URL=http://localhost:8001
 *                   (les appels SSR + les rewrites /api/* du navigateur pointent vers le mock)
 * - page.route()  → chaque spec peut surcharger des endpoints précis au niveau navigateur
 */
export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup",
  globalTeardown: "./e2e/global-teardown",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 1 worker en CI : évite la contention sur le serveur standalone Next.js
  // (2 workers déclenchaient des timeouts intermittents sur l'hydratation React)
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "on-failure" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    /**
     * En CI : l'app est déjà buildée par le step CI → on démarre directement le serveur
     *         standalone (évite un double build de 2–3 min et des risques d'incohérence).
     * En local : next dev pour un démarrage plus rapide.
     */
    command: process.env.CI
      ? "PORT=3000 node .next/standalone/server.js"
      : "npm run dev",
    url: "http://localhost:3000/",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // SSR calls → mock server
      API_INTERNAL_URL: "http://localhost:8001",
      // Navigateur : URLs relatives /api/* → rewrites Next.js → mock server
      NEXT_PUBLIC_API_URL: "",
      NODE_ENV: process.env.CI ? "production" : "development",
    },
  },
});
