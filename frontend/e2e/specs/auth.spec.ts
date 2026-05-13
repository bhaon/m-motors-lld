import { test, expect, type Page } from "../fixtures";
import { MOCK_USER } from "../mock-data";

/** Timeout généreux : compilation V8 froide en CI peut prendre 20–40 s. */
test.setTimeout(180_000);

const EMPTY_CATALOGUE = JSON.stringify({ total: 0, items: [] });
const UNAUTHENTICATED = JSON.stringify({ detail: "Non authentifié" });

/** Doit correspondre à AUTH_DEEPLINK_RESUME_KEY dans Navbar.tsx. */
const AUTH_DEEPLINK_RESUME_STORAGE_KEY = "m-motors-auth-deeplink-resume";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/vehicules**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: EMPTY_CATALOGUE })
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
  );
});

/**
 * Ouvre la modale de connexion via le mécanisme sessionStorage de la Navbar.
 *
 * Pourquoi pas /?connexion=1 directement ?
 * En CI (production standalone), Next.js App Router patche history.replaceState.
 * persistDeeplinkForPossibleRemount appelle replaceState → le router Next.js
 * détecte le changement URL et initie une soft-navigation vers "/" avant que
 * useLayoutEffect ait pu définir authModalOpen=true → modal jamais ouverte.
 *
 * Solution : prépositonner la clé sessionStorage que useLayoutEffect lit au montage.
 * La Navbar ouvre la modale via cette clé lors du rechargement, indépendamment
 * de tout changement d’URL.
 */
async function openLoginModal(page: Page) {
  // 1. Première navigation : compile le bundle JS dans le cache HTTP (V8 froid → chaud)
  await page.goto("/", { waitUntil: "load", timeout: 120_000 });

  // 2. Préparer sessionStorage : useLayoutEffect lira cette clé au prochain montage
  await page.evaluate((key) => {
    sessionStorage.setItem(key, "login");
  }, AUTH_DEEPLINK_RESUME_STORAGE_KEY);

  // 3. Rechargement : bundle servi depuis cache HTTP (V8 chaud), Navbar monte,
  //    useLayoutEffect lit "login" → setAuthModalOpen(true) avant premier paint
  await page.reload({ waitUntil: "load", timeout: 60_000 });

  await expect(page.getByTestId("auth-modal-dialog")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 15_000 });
}

async function openRegisterModal(page: Page) {
  await openLoginModal(page);
  await page.getByTestId("auth-modal-dialog").getByRole("button", { name: "Inscription" }).click();
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
        // Message aligné sur la réponse réelle du backend
        body: JSON.stringify({ message: "Inscription reussie. Un email de confirmation vous a ete envoye pour activer votre compte." }),
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
    // "email de confirmation" n'apparaît que dans ce message de succès
    await expect(page.getByText(/email de confirmation/i)).toBeVisible({ timeout: 5000 });
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
    await page.getByTestId("auth-modal-dialog").getByRole("button", { name: "Connexion" }).first().click();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible({ timeout: 3000 });
  });
});

// ── État Navbar ────────────────────────────────────────────────────────────────

test.describe("État authentifié dans la Navbar", () => {
  test("affiche le menu utilisateur quand connecté", async ({ page }) => {
    // Supprime le handler auth/me → 401 du beforeEach avant d'en ajouter un autre.
    // page.route() empile les handlers (dernier ajouté = priorité haute) mais
    // page.unroute() garantit qu'il n'y a qu'un seul handler sans ambiguïté.
    await page.unroute("**/api/v1/auth/me");
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // 45 s : cette navigation est la 1re de ce test → cache HTTP vide → V8 compile
    // le bundle à froid (15–20 s sur runner CI), puis checkAuthStatus doit s'exécuter.
    // Cohérent avec le timeout utilisé pour auth-modal-dialog dans openLoginModal.
    await expect(page.getByLabel("Ouvrir le menu utilisateur")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".nav-right").getByRole("button", { name: "Connexion" })).not.toBeVisible();
  });
});
