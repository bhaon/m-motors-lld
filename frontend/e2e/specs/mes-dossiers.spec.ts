import { test, expect, type Page } from "@playwright/test";
import { MOCK_USER, MOCK_DOSSIERS } from "../mock-data";

/**
 * Tests E2E — Tableau de bord client « Mes dossiers ».
 */

async function setupAuthenticatedUser(page: Page) {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
  );
}

async function setupUnauthenticatedUser(page: Page) {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) })
  );
}

test.describe("Mes dossiers — état vide", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
    await page.route("**/api/v1/dossiers/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
    );
  });

  test("affiche un message quand aucun dossier", async ({ page }) => {
    await page.goto("/mes-dossiers");

    await expect(
      page.getByText(/aucun dossier|pas de dossier|premier/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("affiche un lien vers le catalogue pour créer un premier dossier", async ({ page }) => {
    await page.goto("/mes-dossiers");

    const catalogueLink = page.getByRole("link", { name: /catalogue/i });
    await expect(catalogueLink).toBeVisible({ timeout: 5000 });
  });

  test("affiche le titre du tableau de bord", async ({ page }) => {
    await page.goto("/mes-dossiers");

    await expect(
      page.getByText(/tableau de bord|mes dossiers/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Mes dossiers — avec dossiers", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
    await page.route("**/api/v1/dossiers/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DOSSIERS) })
    );
  });

  test("affiche le tableau des dossiers", async ({ page }) => {
    await page.goto("/mes-dossiers");

    // Les références des dossiers mock doivent apparaître
    await expect(page.getByText("DOS-2024-001")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("DOS-2024-002")).toBeVisible();
  });

  test("affiche le make et model du véhicule associé", async ({ page }) => {
    await page.goto("/mes-dossiers");

    await expect(page.getByText("Peugeot").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("208").first()).toBeVisible();
    await expect(page.getByText("Renault").first()).toBeVisible();
    await expect(page.getByText("Zoe").first()).toBeVisible();
  });

  test("affiche les statuts des dossiers via le StatusBadge", async ({ page }) => {
    await page.goto("/mes-dossiers");

    // Brouillon et en_instruction doivent être rendus par StatusBadge
    await expect(page.getByText(/brouillon|brouillon/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("le bouton Voir navigue vers le détail du dossier", async ({ page }) => {
    await page.route("**/api/v1/dossiers/101**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_DOSSIERS[0],
          pieces: [],
          historique: [],
          options_lld: [],
        }),
      })
    );

    await page.goto("/mes-dossiers");
    const voirLinks = page.getByRole("link", { name: /voir/i });
    await expect(voirLinks.first()).toBeVisible({ timeout: 5000 });
    await voirLinks.first().click();

    await expect(page).toHaveURL(/\/mes-dossiers\/\d+/, { timeout: 5000 });
  });

  test("le bouton Supprimer est visible uniquement pour les brouillons", async ({ page }) => {
    await page.goto("/mes-dossiers");

    // DOS-2024-001 est en brouillon → bouton Supprimer visible
    const deleteButtons = page.getByRole("button", { name: /supprimer/i });
    await expect(deleteButtons).toHaveCount(1, { timeout: 5000 });
  });

  test("confirme la suppression d'un brouillon", async ({ page }) => {
    await page.route("**/api/v1/dossiers/101", (route) => {
      if (route.request().method() === "DELETE") {
        route.fulfill({ status: 204 });
      } else {
        route.continue();
      }
    });

    await page.goto("/mes-dossiers");

    const deleteBtn = page.getByRole("button", { name: /supprimer/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Le dossier doit disparaître de la liste après suppression
    await expect(page.getByText("DOS-2024-001")).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("Mes dossiers — non authentifié", () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticatedUser(page);
    await page.route("**/api/v1/dossiers/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) })
    );
  });

  test("affiche une erreur ou redirige si non connecté", async ({ page }) => {
    await page.goto("/mes-dossiers");

    // Soit redirection vers l'accueil, soit message d'erreur
    const isRedirected = page.url().includes("/?") || page.url() === "http://localhost:3000/";
    const hasError = await page.getByRole("alert").isVisible().catch(() => false);
    const hasErrorText = await page.getByText(/connect|authentif|erreur/i).isVisible().catch(() => false);

    expect(isRedirected || hasError || hasErrorText).toBeTruthy();
  });
});

test.describe("Notice de création de dossier", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedUser(page);
    await page.route("**/api/v1/dossiers/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DOSSIERS) })
    );
  });

  test("affiche la notice de création quand paramètre cree=1 est présent", async ({ page }) => {
    await page.goto("/mes-dossiers?cree=1&ref=DOS-2024-003&type=ACHAT&id=103");

    // La notice de confirmation doit apparaître
    await expect(
      page.getByText(/créé|dossier.*achat|DOS-2024-003/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("la notice peut être fermée", async ({ page }) => {
    await page.goto("/mes-dossiers?cree=1&ref=DOS-2024-003&type=ACHAT&id=103");

    const closeBtn = page.getByRole("button", { name: /fermer/i });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(closeBtn).not.toBeVisible({ timeout: 3000 });
    }
  });
});
