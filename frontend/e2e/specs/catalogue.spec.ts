import { test, expect } from "@playwright/test";
import { MOCK_VEHICLES } from "../mock-data";

/**
 * Tests E2E — Page catalogue (/).
 *
 * Sélecteurs documentés depuis les composants réels :
 * - Cartes véhicules  : <button class="vehicle-card" aria-label="Ouvrir la fiche Make Model, year">
 * - Modal véhicule    : <div class="modal-panel"> (pas de role=dialog)
 *   • Titre make      : texte "{v.make} · {v.year}" dans la modal-hero
 *   • Titre model     : <h2>{v.model}</h2> dans le modal-body
 * - SearchBar         : que des <select id="search-*"> + 1 <input type="number" id="search-prix-max">
 * - FiltersRow        : <button aria-pressed="...">Tous/Achat/LLD disponible</button>
 */

const UNAUTHENTICATED = JSON.stringify({ detail: "Non authentifié" });

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
    await page.goto("/");
  });

  test("affiche les cartes des véhicules du catalogue", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Peugeot 208/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Renault Zoe/i })).toBeVisible();
  });

  test("affiche le prix sur la carte véhicule", async ({ page }) => {
    // Le prix peut être formaté FR (18 990) ou non (18990)
    const priceText = page.getByText(/18[\s ]?990/);
    await expect(priceText.first()).toBeVisible();
  });

  test("badge LLD visible sur les véhicules en location", async ({ page }) => {
    // La Renault Zoé est LLD → badge "LLD" dans la carte
    await expect(page.getByText("LLD").first()).toBeVisible();
  });

  test("ouvre la modale au clic sur une carte véhicule", async ({ page }) => {
    await page.getByRole("button", { name: /Peugeot 208/i }).click();
    // La modal-panel doit devenir visible
    await expect(page.locator(".modal-panel")).toBeVisible({ timeout: 5000 });
    // Le modèle (h2) doit apparaître dans la modale
    await expect(page.getByRole("heading", { name: "208" })).toBeVisible({ timeout: 5000 });
  });

  test("ferme la modale avec le bouton ✕", async ({ page }) => {
    await page.getByRole("button", { name: /Peugeot 208/i }).click();
    await expect(page.locator(".modal-panel")).toBeVisible({ timeout: 5000 });

    // Bouton Fermer dans la hero de la modale (aria-label="Fermer")
    await page.getByLabel("Fermer la modale").click();
    await expect(page.locator(".modal-panel")).not.toBeVisible({ timeout: 3000 });
  });

  test("la SearchBar est visible avec ses filtres", async ({ page }) => {
    // Vérifier les <select> de la SearchBar via leur id
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

  test("le filtre LLD disponible met à jour l'affichage", async ({ page }) => {
    // Mock initial : 2 véhicules
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await page.goto("/");

    // Cliquer sur "LLD disponible" dans la FiltersRow
    await page.getByRole("button", { name: "LLD disponible" }).click();

    // Le bouton doit passer en état pressed
    await expect(
      page.getByRole("button", { name: "LLD disponible" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("le filtre Achat met à jour l'état du bouton", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await page.goto("/");

    await page.getByRole("button", { name: "Achat" }).click();
    await expect(
      page.getByRole("button", { name: "Achat" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("affiche un message ou état vide quand le catalogue est vide", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
    );
    await page.goto("/");

    // "0 véhicule" dans la FiltersRow ou un message d'état vide
    await expect(
      page.getByText(/0 véhicule|aucun véhicule|aucun résultat/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("le select moteur permet de sélectionner Électrique", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEHICLES) })
    );
    await page.goto("/");

    await page.locator("#search-moteur").selectOption("Électrique");
    await expect(page.locator("#search-moteur")).toHaveValue("Électrique");
  });
});
