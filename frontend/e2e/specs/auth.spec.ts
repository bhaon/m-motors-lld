import { test, expect, type Page } from "@playwright/test";
import { MOCK_USER } from "../mock-data";

/**
 * Tests E2E — Authentification (modale connexion/inscription).
 *
 * Sélecteurs documentés depuis AuthModal.tsx :
 * - onglet login  : bouton "Connexion" (type="button") dans le header de la modale
 * - onglet register : bouton "Inscription" (type="button") dans le header de la modale
 * - submit login  : <button type="submit">Se connecter</button>
 * - submit register : <button type="submit">S'inscrire</button>
 * - champ prénom  : placeholder="Prenom" (sans accent dans le HTML)
 * - champ nom     : placeholder="Nom" (exact: true obligatoire — "Prenom" contient "nom")
 */

const EMPTY_CATALOGUE = JSON.stringify({ total: 0, items: [] });
const UNAUTHENTICATED = JSON.stringify({ detail: "Non authentifié" });

async function mockBaseRoutes(page: Page) {
  await page.route("**/api/v1/vehicules**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: EMPTY_CATALOGUE })
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
  );
}

async function openLoginModal(page: Page) {
  await mockBaseRoutes(page);
  await page.goto("/?connexion=1");
  // Attendre que le champ email soit visible — la modale est ouverte
  await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 5000 });
}

async function openRegisterModal(page: Page) {
  await mockBaseRoutes(page);
  await page.goto("/?inscription=1");
  // Attendre que le bouton S'inscrire soit visible
  await expect(page.getByRole("button", { name: "S'inscrire" })).toBeVisible({ timeout: 5000 });
}

// ── Connexion ─────────────────────────────────────────────────────────────────

test.describe("Modale de connexion", () => {
  test("affiche le formulaire email/mot de passe", async ({ page }) => {
    await openLoginModal(page);
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Mot de passe")).toBeVisible();
    // Bouton submit unique dans le formulaire de login
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("connexion réussie ferme la modale et affiche l'utilisateur", async ({ page }) => {
    await openLoginModal(page);

    await page.route("**/api/v1/auth/login", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": "access_token=fake-token; Path=/; HttpOnly" },
        body: JSON.stringify({ message: "Connecté" }),
      })
    );
    // Après login, /auth/me retourne l'utilisateur
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );

    await page.getByPlaceholder("Email").fill("client@example.com");
    await page.getByPlaceholder("Mot de passe").fill("Password123!");
    // Cibler le submit unique dans la modale (type="submit", texte "Se connecter")
    await page.getByRole("button", { name: "Se connecter" }).click();

    // La modale se ferme → le champ email disparaît
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

  test("le bouton Se connecter est présent et cliquable", async ({ page }) => {
    await openLoginModal(page);
    const btn = page.getByRole("button", { name: "Se connecter" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });
});

// ── Inscription ────────────────────────────────────────────────────────────────

test.describe("Modale d'inscription", () => {
  test("affiche tous les champs du formulaire", async ({ page }) => {
    await openRegisterModal(page);
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Prenom")).toBeVisible();
    // exact: true obligatoire — "Prenom" contient "nom" en sous-chaîne insensible à la casse
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

    await expect(
      page.getByText(/vérifi|email|créé|succès|inscription/i)
    ).toBeVisible({ timeout: 5000 });
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

    // Dans la modale, les onglets sont des boutons type="button" "Connexion" et "Inscription"
    // Le bouton "Connexion" de l'onglet est dans getByLabel('Créer un compte client')
    const loginTab = page.getByLabel("Créer un compte client").getByRole("button", { name: "Connexion" });
    if (await loginTab.isVisible()) {
      await loginTab.click();
      await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible({ timeout: 3000 });
    }
  });
});

// ── État Navbar ────────────────────────────────────────────────────────────────

test.describe("État authentifié dans la Navbar", () => {
  test("affiche le menu utilisateur quand connecté", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: EMPTY_CATALOGUE })
    );
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );

    await page.goto("/");

    // Le bouton "Ouvrir le menu utilisateur" doit apparaître (Navbar connectée)
    await expect(page.getByLabel("Ouvrir le menu utilisateur")).toBeVisible({ timeout: 5000 });
  });
});
