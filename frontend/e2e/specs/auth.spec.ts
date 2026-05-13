import { test, expect, type Page } from "@playwright/test";
import { MOCK_USER } from "../mock-data";

/** CI : openLoginModal peut dépasser 30 s (navigation complète + réseau + modale). */
test.setTimeout(120_000);

/**
 * Tests E2E — Authentification.
 *
 * Les routes de base (vehicules, auth/me) sont configurées en test.beforeEach
 * comme dans navigation.spec.ts (pattern éprouvé qui passe toujours).
 *
 * global-setup.ts effectue un warmup HTTP (`/?connexion=1`) avant les tests pour
 * forcer la compilation JIT de V8 sur le bundle React (Navbar + AuthModal).
 * openLoginModal charge d’abord `/`, nettoie sessionStorage, puis force un chargement
 * complet vers `/?connexion=1` via `location.assign` : un second `page.goto` seul peut
 * rester en navigation client Next sans remonter la Navbar → le `useLayoutEffect` deeplink
 * ne se rejoue pas.
 * (Un `router.replace` après ouverture remontait la page et réinitialisait l'état — corrigé
 * dans Navbar avec `history.replaceState`, reprise via `sessionStorage` si remontée Next).
 */

const EMPTY_CATALOGUE = JSON.stringify({ total: 0, items: [] });
const UNAUTHENTICATED = JSON.stringify({ detail: "Non authentifié" });

/** Aligné sur `Navbar.tsx` — évite qu’un résidu de session fasse rater le deeplink `?connexion=1`. */
const AUTH_DEEPLINK_RESUME_STORAGE_KEY = "m-motors-auth-deeplink-resume";

// Warmup Chromium V8 avant tous les tests auth.
// auth.spec.ts s'exécute en premier (ordre alphabétique) → JIT froid sur le runner.
// Ce beforeAll charge `/?connexion=1` une fois pour compiler Navbar + AuthModal,
// en complément du global-setup.
test.beforeAll(async ({ browser }) => {
  const warmupPage = await browser.newPage();
  try {
    await warmupPage.route("**/api/v1/vehicules**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: EMPTY_CATALOGUE })
    );
    await warmupPage.route("**/api/v1/auth/me", (r) =>
      r.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
    );
    await warmupPage.goto("http://localhost:3000/?connexion=1", {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
  } catch {
    // Non-bloquant : les tests tournent quand même, juste potentiellement plus lents
  } finally {
    await warmupPage.close();
  }
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/vehicules**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: EMPTY_CATALOGUE })
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: UNAUTHENTICATED })
  );
});

/**
 * Ouvre la modale de connexion via `/?connexion=1` (Navbar + sessionStorage si remontée).
 * `location.assign` après `/` force un document complet (pas seulement une transition client),
 * sinon le `useLayoutEffect` deeplink (`[]`) ne se réexécute pas.
 */
async function openLoginModal(page: Page) {
  await page.goto("/", { waitUntil: "load", timeout: 60_000 });
  await page.evaluate((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    const next = new URL(window.location.origin);
    next.searchParams.set("connexion", "1");
    window.location.assign(next.toString());
  }, AUTH_DEEPLINK_RESUME_STORAGE_KEY);
  await page.waitForURL(/\?connexion=1/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("auth-modal-dialog")).toBeVisible({ timeout: 45_000 });
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
    // "Compte créé" n'apparaît que dans le message de succès de l'inscription —
    // le regex large /inscription/i matchait aussi le bouton onglet et le bouton
    // "Inscription..." (loading), ce qui causait un "resolved to more than one element".
    await expect(page.getByText(/Compte créé|Inscription réussie/i)).toBeVisible({ timeout: 5000 });
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
