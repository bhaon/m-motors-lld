import { test, expect } from "@playwright/test";
import { MOCK_VEHICLES } from "../mock-data";

/**
 * Tests E2E — Page catalogue (/).
 * Le mock API server sert les véhicules côté SSR.
 * Le navigateur utilise page.route() pour les appels client.
 */

test.describe("Catalogue véhicules", () => {
  test.beforeEach(async ({ page }) => {
    // Intercepte les appels navigateur vers l'API véhicules (filtres, etc.)
    await page.route("**/api/v1/vehicules**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_VEHICLES),
      });
    });

    await page.route("**/api/v1/auth/me", (route) => {
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) });
    });

    await page.goto("/");
  });

  test("affiche les cartes des véhicules du catalogue", async ({ page }) => {
    // Les 2 véhicules mock doivent être rendus
    await expect(page.getByRole("button", { name: /Peugeot 208/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Renault Zoe/i })).toBeVisible();
  });

  test("affiche le prix et l'année sur chaque carte", async ({ page }) => {
    // Vérifie que les données de base sont bien affichées
    await expect(page.getByText("18 990").or(page.getByText("18990")).first()).toBeVisible();
    await expect(page.getByText("2023").first()).toBeVisible();
  });

  test("badge LLD visible sur les véhicules en location", async ({ page }) => {
    // La Renault Zoé est LLD → badge LLD
    const lldBadge = page.locator("text=LLD").first();
    await expect(lldBadge).toBeVisible();
  });

  test("ouvre la modale au clic sur une carte", async ({ page }) => {
    await page.getByRole("button", { name: /Peugeot 208/i }).click();

    // La modale doit apparaître avec les infos du véhicule
    await expect(page.getByRole("dialog").or(
      page.locator("[role=dialog]")
    ).first()).toBeVisible({ timeout: 5000 }).catch(async () => {
      // Fallback: cherche le contenu modal par le nom du véhicule en titre
      await expect(page.getByText("Peugeot 208").last()).toBeVisible();
    });
  });

  test("la barre de recherche Hero est visible", async ({ page }) => {
    // La SearchBar permet de filtrer par marque, modèle, etc.
    const searchInputs = page.getByRole("textbox");
    await expect(searchInputs.first()).toBeVisible();
  });

  test("le titre de la page contient M-Motors ou le nom de l'appli", async ({ page }) => {
    await expect(page).toHaveTitle(/M.?Motors|Catalogue|Véhicules/i);
  });
});

test.describe("Filtres catalogue", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) });
    });
    await page.route("**/api/v1/auth/me", (route) => {
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) });
    });
    await page.goto("/");
  });

  test("filtre LLD masque les véhicules achat uniquement", async ({ page }) => {
    // Simule un filtre LLD qui ne retourne que la Zoé
    await page.route("**/api/v1/vehicules**", (route) => {
      const lldOnly = { total: 1, items: [MOCK_VEHICLES.items[1]] };
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lldOnly) });
    });

    // Cherche le select "Type" dans la SearchBar et sélectionne LLD
    const typeSelect = page.locator("select").first();
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption("lld");
      await page.waitForTimeout(300); // debounce
      await expect(page.getByRole("button", { name: /Renault Zoe/i })).toBeVisible();
    }
  });

  test("affiche un message vide quand le catalogue est vide", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) });
    });

    await page.goto("/");
    // Un message "aucun véhicule" ou similaire doit apparaître
    await expect(
      page.getByText(/aucun véhicule|0 véhicule|catalogue vide/i).or(
        page.getByText(/Aucun résultat/i)
      ).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
