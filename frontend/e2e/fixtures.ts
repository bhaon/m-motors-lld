/**
 * Fixture Playwright partagée entre tous les spec files.
 *
 * Ajoute automatiquement un handler pour les ressources Google Fonts :
 * en CI, ces requêtes cross-origin peuvent prendre 10–30 s ou bloquer
 * indéfiniment et empêcher waitForLoadState("networkidle") de se résoudre.
 * auth.spec.ts s'exécute en premier (ordre alphabétique) → pas de cache HTTP.
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend<object>({
  page: async ({ page }, use) => {
    // Retourner immédiatement du CSS/woff2 vide pour éviter les délais réseau CI
    await page.route("https://fonts.googleapis.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "text/css", body: "" })
    );
    await page.route("https://fonts.gstatic.com/**", (r) =>
      r.fulfill({ status: 200, contentType: "font/woff2", body: "" })
    );
    await use(page);
  },
});

export { expect };
export type { Page } from "@playwright/test";
