import { test, expect, type Page } from "@playwright/test";
import { MOCK_VEHICLES } from "../mock-data";

/**
 * Tests E2E — Page catalogue (/).
 * waitForLoadState("networkidle") garantit que React est hydraté avant interaction.
 */

const UNAUTHENTICATED = JSON.stringify({ detail: "Non authentifié" });

async function gotoAndWaitHydration(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

test.describe("Catalogue véhicules", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
    );
    await page.route("**/api/v1/vehicules/*/galerie", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );
    await page.route("**/api/v1/lld-catalog**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) })
    );
    await gotoAndWaitHydration(page);
  });

  test("affiche les cartes des véhicules du catalogue", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Peugeot 208/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Renault Zoe/i })).toBeVisible();
  });

  test("affiche le prix sur la carte véhicule", async ({ page }) => {
    await expect(page.getByText(/18[\s ]?990/).first()).toBeVisible();
  });

  test("badge LLD visible sur les véhicules en location", async ({ page }) => {
    await expect(page.getByText("LLD").first()).toBeVisible();
  });

  test("ouvre la modale au clic sur une carte véhicule", async ({ page }) => {
    await page.getByRole("button", { name: /Peugeot 208/i }).click();
    await expect(page.locator(".modal-panel")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "208" })).toBeVisible({ timeout: 5000 });
  });

  test("ferme la modale avec le bouton Fermer", async ({ page }) => {
    await page.getByRole("button", { name: /Peugeot 208/i }).click();
    await expect(page.locator(".modal-panel")).toBeVisible({ timeout: 5000 });
    await page.getByLabel("Fermer la modale").click();
    await expect(page.locator(".modal-panel")).not.toBeVisible({ timeout: 3000 });
  });

  test("la SearchBar est visible avec ses filtres", async ({ page }) => {
    await expect(page.locator("#search-marque")).toBeVisible();
    await expect(page.locator("#search-moteur")).toBeVisible();
    await expect(page.locator("#search-prix-max")).toBeVisible();
  });

  test("le titre de la page contient M-Motors", async ({ page }) => {
    await expect(page).toHaveTitle(/M.?Motors/i);
  });

  test("les filtres FiltersRow sont visibles (Tous, Achat, LLD disponible)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Tous" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Achat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "LLD disponible" })).toBeVisible();
  });
});

test.describe("Filtres catalogue", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
    );
  });

  test("le filtre LLD disponible bascule son état aria-pressed", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await gotoAndWaitHydration(page);

    const lldBtn = page.getByRole("button", { name: "LLD disponible" });
    await expect(lldBtn).toHaveAttribute("aria-pressed", "false");
    await lldBtn.click();
    await expect(lldBtn).toHaveAttribute("aria-pressed", "true", { timeout: 3000 });
  });

  test("le filtre Achat bascule son état aria-pressed", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await gotoAndWaitHydration(page);

    const achatBtn = page.getByRole("button", { name: "Achat" });
    await achatBtn.click();
    await expect(achatBtn).toHaveAttribute("aria-pressed", "true", { timeout: 3000 });
  });

  test("affiche un message quand le catalogue est vide", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
    );
    await gotoAndWaitHydration(page);
    await expect(
      page.getByText(/0 véhicule|catalogue vide/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("le select moteur permet de sélectionner Électrique", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await gotoAndWaitHydration(page);
    await page.locator("#search-moteur").selectOption("Électrique");
    await expect(page.locator("#search-moteur")).toHaveValue("Électrique");
  });
});
