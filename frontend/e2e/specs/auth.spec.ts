import { test, expect, type Page } from "@playwright/test";
import { MOCK_USER } from "../mock-data";

/**
 * Tests E2E — Authentification.
 *
 * Les routes de base (vehicules, auth/me) sont configurées en test.beforeEach
 * comme dans navigation.spec.ts, ce qui est le pattern éprouvé qui fonctionne.
 *
 * openLoginModal utilise page.waitForFunction sur le fiber React pour garantir
 * que React a terminé hydrateRoot() sur le bouton avant de cliquer.
 * waitForLoadState("networkidle") ne suffit pas en CI : le réseau peut être
 * inactif pendant que React exécute encore son cycle d'hydratation JavaScript.
 * La présence de __reactFiber$... sur un élément DOM est la seule garantie
 * que le handler onClick est attaché.
 */

const EMPTY_CATALOGUE = JSON.stringify({ total: 0, items: [] });
const UNAUTHENTICATED = JSON.stringify({ detail: "Non authentifié" });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/vehicules**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: EMPTY_CATALOGUE })
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
  );
});

async function openLoginModal(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Attend que React ait hydraté le bouton Connexion : le fiber React
  // (__reactFiber$...) n'apparaît sur un élément DOM qu'après hydrateRoot().
  await page.waitForFunction(
    () => {
      const btn = document.querySelector(".nav-right button");
      if (!btn) return false;
      return Object.keys(btn as Element & Record<string, unknown>).some((k) =>
        k.startsWith("__reactFiber")
      );
    },
    { timeout: 15000 }
  );
  await page.locator(".nav-right").getByRole("button", { name: "Connexion" }).click();
  await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 10000 });
}

async function openRegisterModal(page: Page) {
  await openLoginModal(page);
  await page.getByLabel("Accès à votre espace client").getByRole("button", { name: "Inscription" }).click();
  await expect(page.getByRole("button", { name: "S'inscrire" })).toBeVisible({ timeout: 3000 });
}

// ── Connexion ─────────────────────────────────────────────────────────────────

test.describe("Modale de connexion", () => {
  test("affiche le formulaire email/mot de passe", async ({ page }) => {
    await openLoginModal(page);
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Mot de passe")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("connexion réussie ferme la modale", async ({ page }) => {
    await openLoginModal(page);
    await page.route("**/api/v1/auth/login", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": "access_token=fake-token; Path=/; HttpOnly" },
        body: JSON.stringify({ message: "Connecté" }),
      })
    );
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );
    await page.getByPlaceholder("Email").fill("client@example.com");
    await page.getByPlaceholder("Mot de passe").fill("Password123!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByPlaceholder("Email")).not.toBeVisible({ timeout: 5000 });
  });

  test("affiche une erreur pour des identifiants invalides", async ({ page }) => {
    await openLoginModal(page);
    await page.route("**/api/v1/auth/login", (r) =>
      r.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Email ou mot de passe invalide." }),
      })
    );
    await page.getByPlaceholder("Email").fill("wrong@example.com");
    await page.getByPlaceholder("Mot de passe").fill("wrongpass");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Email ou mot de passe invalide.")).toBeVisible({ timeout: 5000 });
  });

  test("le bouton Se connecter est visible et activé", async ({ page }) => {
    await openLoginModal(page);
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("ferme la modale avec le bouton Fermer", async ({ page }) => {
    await openLoginModal(page);
    await page.getByLabel("Fermer").click();
    await expect(page.getByPlaceholder("Email")).not.toBeVisible({ timeout: 3000 });
  });
});

// ── Inscription ────────────────────────────────────────────────────────────────

test.describe("Modale d'inscription", () => {
  test("affiche tous les champs du formulaire", async ({ page }) => {
    await openRegisterModal(page);
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Prenom")).toBeVisible();
    await expect(page.getByPlaceholder("Nom", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "S'inscrire" })).toBeVisible();
  });

  test("inscription réussie affiche un message de confirmation", async ({ page }) => {
    await openRegisterModal(page);
    await page.route("**/api/v1/auth/register", (r) =>
      r.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "Compte créé. Vérifiez votre email." }),
      })
    );
    await page.getByPlaceholder("Email").fill("nouveau@example.com");
    await page.getByPlaceholder("Mot de passe").first().fill("SecretPass123!");
    await page.getByPlaceholder("Confirmer le mot de passe").fill("SecretPass123!");
    await page.getByPlaceholder("Prenom").fill("Jean");
    await page.getByPlaceholder("Nom", { exact: true }).fill("Martin");
    await page.locator('input[type="date"]').fill("1992-03-15");
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await expect(page.getByText(/vérifi|email|créé|succès|inscription/i)).toBeVisible({ timeout: 5000 });
  });

  test("affiche une erreur si l'email est déjà utilisé", async ({ page }) => {
    await openRegisterModal(page);
    await page.route("**/api/v1/auth/register", (r) =>
      r.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Un compte existe déjà avec cet email." }),
      })
    );
    await page.getByPlaceholder("Email").fill("existant@example.com");
    await page.getByPlaceholder("Mot de passe").first().fill("SecretPass123!");
    await page.getByPlaceholder("Confirmer le mot de passe").fill("SecretPass123!");
    await page.getByPlaceholder("Prenom").fill("Jean");
    await page.getByPlaceholder("Nom", { exact: true }).fill("Martin");
    await page.locator('input[type="date"]').fill("1992-03-15");
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }
    await page.getByRole("button", { name: "S'inscrire" }).click();
    await expect(page.getByText("Un compte existe déjà avec cet email.")).toBeVisible({ timeout: 5000 });
  });

  test("peut basculer vers l'onglet connexion depuis l'inscription", async ({ page }) => {
    await openRegisterModal(page);
    await page.getByLabel("Créer un compte client").getByRole("button", { name: "Connexion" }).click();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible({ timeout: 3000 });
  });
});

// ── État Navbar ────────────────────────────────────────────────────────────────

test.describe("État authentifié dans la Navbar", () => {
  test("affiche le menu utilisateur quand connecté", async ({ page }) => {
    // Override du beforeEach : auth/me renvoie MOCK_USER → isAuthenticated = true
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Attend que checkAuthStatus ait reçu MOCK_USER → isAuthenticated = true
    await expect(page.getByLabel("Ouvrir le menu utilisateur")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".nav-right").getByRole("button", { name: "Connexion" })).not.toBeVisible();
  });
});
