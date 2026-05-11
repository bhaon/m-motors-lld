import { test, expect } from "@playwright/test";

/**
 * Tests E2E — Navigation globale (Navbar, pages statiques, responsive).
 */

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/vehicules**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) })
  );
});

test.describe("Navbar desktop", () => {
  test("affiche le logo M-Motors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("M-Motors").first()).toBeVisible();
  });

  test("le lien À propos est visible et navigue vers /a-propos", async ({ page }) => {
    await page.goto("/");
    const aProposLink = page.getByRole("link", { name: /à propos/i }).first();
    await expect(aProposLink).toBeVisible();
    await aProposLink.click();
    await expect(page).toHaveURL(/\/a-propos/);
  });

  test("le bouton Connexion ouvre la modale", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /connexion/i }).first().click();
    await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Page À propos", () => {
  test("affiche le contenu de présentation de M-Motors", async ({ page }) => {
    await page.goto("/a-propos");
    // Vérifie que la page contient des éléments structurants
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("M-Motors").first()).toBeVisible();
  });

  test("a un titre de page pertinent", async ({ page }) => {
    await page.goto("/a-propos");
    await expect(page).toHaveTitle(/M.?Motors|À propos|Propos/i);
  });

  test("contient un CTA vers le catalogue", async ({ page }) => {
    await page.goto("/a-propos");
    // Il doit y avoir un lien vers le catalogue (page d'accueil)
    const catalogueLink = page.getByRole("link", { name: /catalogue|véhicules|voir|découvrir/i });
    await expect(catalogueLink.first()).toBeVisible();
  });
});

test.describe("Responsive — menu mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone SE

  test("le bouton hamburger est visible sur mobile", async ({ page }) => {
    await page.goto("/");
    const hamburger = page.getByLabel(/ouvrir le menu|fermer le menu/i);
    await expect(hamburger).toBeVisible();
  });

  test("le menu mobile s'ouvre au clic sur le hamburger", async ({ page }) => {
    await page.goto("/");
    const hamburger = page.getByLabel(/ouvrir le menu/i);
    await hamburger.click();

    // Le panel mobile doit apparaître avec les liens
    const mobilePanel = page.locator(".nav-mobile-panel");
    await expect(mobilePanel).toBeVisible({ timeout: 3000 });
  });

  test("le menu mobile contient les liens de navigation", async ({ page }) => {
    await page.goto("/");
    const hamburger = page.getByLabel(/ouvrir le menu/i);
    await hamburger.click();

    // Vérifie la présence des liens dans le panel mobile
    await expect(page.locator(".nav-mobile-panel")).toContainText(/à propos/i);
    await expect(page.locator(".nav-mobile-panel")).toContainText(/connexion/i);
  });

  test("le menu mobile se ferme après navigation", async ({ page }) => {
    await page.goto("/");
    const hamburger = page.getByLabel(/ouvrir le menu/i);
    await hamburger.click();

    // Clic sur "À propos" dans le menu mobile
    await page.locator(".nav-mobile-panel").getByText(/à propos/i).click();
    await expect(page).toHaveURL(/\/a-propos/);
  });
});

test.describe("Routes de santé frontend", () => {
  test("GET /healthz retourne 200", async ({ request }) => {
    const resp = await request.get("http://localhost:3000/healthz");
    expect(resp.status()).toBe(200);
  });

  test("GET /readyz retourne 200", async ({ request }) => {
    const resp = await request.get("http://localhost:3000/readyz");
    expect(resp.status()).toBe(200);
  });
});

test.describe("Redirections", () => {
  test("/connexion redirige vers /?connexion=1", async ({ page }) => {
    await page.goto("/connexion");
    await expect(page).toHaveURL(/\?connexion=1/, { timeout: 5000 });
  });

  test("/inscription redirige vers /?inscription=1", async ({ page }) => {
    await page.goto("/inscription");
    await expect(page).toHaveURL(/\?inscription=1/, { timeout: 5000 });
  });
});
