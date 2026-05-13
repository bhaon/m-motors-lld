import { test, expect } from "../fixtures";

/**
 * Tests E2E — Navigation globale (Navbar, pages statiques, responsive).
 * waitForLoadState("networkidle") avant toute interaction UI pour garantir l'hydratation.
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
    // Recharge + clic jusqu’à succès : un seul clic « raté » ne suffit pas à corriger l’hydratation ;
    // refaire un cycle page évite aussi un second clic sur la même vue (backdrop qui fermerait la modale).
    await expect(async () => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.locator(".nav-right").getByRole("button", { name: "Connexion" }).click();
      await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 45_000 });
  });
});

test.describe("Page À propos", () => {
  test("affiche le contenu de présentation de M-Motors", async ({ page }) => {
    await page.goto("/a-propos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("M-Motors").first()).toBeVisible();
  });

  test("a un titre de page pertinent", async ({ page }) => {
    await page.goto("/a-propos");
    await expect(page).toHaveTitle(/M.?Motors|À propos|Propos/i);
  });

  test("contient un CTA vers le catalogue", async ({ page }) => {
    await page.goto("/a-propos");
    const catalogueLink = page.getByRole("link", { name: /catalogue|véhicules|voir|découvrir/i });
    await expect(catalogueLink.first()).toBeVisible();
  });
});

test.describe("Responsive — menu mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone SE

  test("le bouton hamburger est visible sur mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(/ouvrir le menu|fermer le menu/i)).toBeVisible();
  });

  test("le menu mobile s'ouvre au clic sur le hamburger", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/ouvrir le menu/i).click();
    await expect(page.locator(".nav-mobile-panel")).toBeVisible({ timeout: 5000 });
  });

  test("le menu mobile contient les liens de navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/ouvrir le menu/i).click();
    await expect(page.locator(".nav-mobile-panel")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".nav-mobile-panel")).toContainText(/à propos/i);
    await expect(page.locator(".nav-mobile-panel")).toContainText(/connexion/i);
  });

  test("le menu mobile se ferme après navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/ouvrir le menu/i).click();
    await expect(page.locator(".nav-mobile-panel")).toBeVisible({ timeout: 5000 });
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
    // useEffect router.replace() est asynchrone en build production → waitForURL
    await page.waitForURL(/\?connexion=1/, { timeout: 10000 });
  });

  test("/inscription redirige vers /?inscription=1", async ({ page }) => {
    await page.goto("/inscription");
    await page.waitForURL(/\?inscription=1/, { timeout: 10000 });
  });
});
