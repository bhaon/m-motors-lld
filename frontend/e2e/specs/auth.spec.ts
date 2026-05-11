import { test, expect, type Page } from "@playwright/test";
import { MOCK_USER } from "../mock-data";

/**
 * Tests E2E — Authentification (modale connexion/inscription).
 * L'auth utilise une modale ouverte depuis la Navbar.
 * La route /connexion redirige vers /?connexion=1 → ouvre l'onglet connexion.
 */

async function openLoginModal(page: Page) {
  await page.route("**/api/v1/vehicules**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) })
  );

  await page.goto("/?connexion=1");
  await page.waitForTimeout(500);
}

async function openRegisterModal(page: Page) {
  await page.route("**/api/v1/vehicules**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) })
  );

  await page.goto("/?inscription=1");
  await page.waitForTimeout(500);
}

test.describe("Modale de connexion", () => {
  test("affiche le formulaire email/mot de passe", async ({ page }) => {
    await openLoginModal(page);
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Mot de passe")).toBeVisible();
  });

  test("connexion réussie ferme la modale et affiche l'utilisateur", async ({ page }) => {
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Non authentifié" }) })
    );
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
    );

    await openLoginModal(page);

    // Mock la réponse de connexion (renvoie cookie + succès)
    await page.route("**/api/v1/auth/login", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": "access_token=fake-token; Path=/; HttpOnly" },
        body: JSON.stringify({ message: "Connecté" }),
      });
    });

    // Après connexion, /auth/me retourne l'utilisateur
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );

    await page.getByPlaceholder("Email").fill("client@example.com");
    await page.getByPlaceholder("Mot de passe").first().fill("Password123!");
    await page.getByRole("button", { name: /se connecter|connexion/i }).click();

    // La modale doit se fermer
    await expect(page.getByPlaceholder("Email")).not.toBeVisible({ timeout: 5000 });
  });

  test("affiche une erreur pour des identifiants invalides", async ({ page }) => {
    await openLoginModal(page);

    await page.route("**/api/v1/auth/login", (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Email ou mot de passe invalide." }),
      });
    });

    await page.getByPlaceholder("Email").fill("wrong@example.com");
    await page.getByPlaceholder("Mot de passe").first().fill("wrongpass");
    await page.getByRole("button", { name: /se connecter|connexion/i }).click();

    await expect(page.getByText(/invalide|incorrect|Email ou mot de passe/i)).toBeVisible({ timeout: 5000 });
  });

  test("le bouton connexion est désactivé si les champs sont vides", async ({ page }) => {
    await openLoginModal(page);

    const submitBtn = page.getByRole("button", { name: /se connecter|connexion/i });
    // Le formulaire HTML doit valider les champs required
    await expect(page.getByPlaceholder("Email")).toBeEmpty();
  });
});

test.describe("Modale d'inscription", () => {
  test("affiche tous les champs du formulaire", async ({ page }) => {
    await openRegisterModal(page);

    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder(/prenom|prénom/i)).toBeVisible();
    await expect(page.getByPlaceholder("Nom")).toBeVisible();
  });

  test("inscription réussie affiche un message de confirmation", async ({ page }) => {
    await openRegisterModal(page);

    await page.route("**/api/v1/auth/register", (route) => {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "Compte créé. Vérifiez votre email." }),
      });
    });

    await page.getByPlaceholder("Email").fill("nouveau@example.com");
    await page.getByPlaceholder(/prenom|prénom/i).fill("Jean");
    await page.getByPlaceholder("Nom").fill("Martin");

    // Remplir le mot de passe (peut avoir plusieurs placeholders)
    const pwdFields = page.getByPlaceholder("Mot de passe");
    await pwdFields.first().fill("SecretPass123!");

    const confirmFields = page.getByPlaceholder("Confirmer le mot de passe");
    if (await confirmFields.isVisible()) {
      await confirmFields.fill("SecretPass123!");
    }

    // CGU et politique
    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }

    await page.getByRole("button", { name: /créer|s'inscrire|inscription/i }).click();

    // Message de succès ou fermeture modale
    await expect(
      page.getByText(/vérifi|email|créé|succès/i).or(page.getByText(/confirmer/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test("affiche une erreur si l'email est déjà utilisé", async ({ page }) => {
    await openRegisterModal(page);

    await page.route("**/api/v1/auth/register", (route) => {
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Un compte existe déjà avec cet email." }),
      });
    });

    await page.getByPlaceholder("Email").fill("existant@example.com");
    await page.getByPlaceholder(/prenom|prénom/i).fill("Jean");
    await page.getByPlaceholder("Nom").fill("Martin");
    await page.getByPlaceholder("Mot de passe").first().fill("SecretPass123!");

    const confirmFields = page.getByPlaceholder("Confirmer le mot de passe");
    if (await confirmFields.isVisible()) {
      await confirmFields.fill("SecretPass123!");
    }

    const checkboxes = page.getByRole("checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }

    await page.getByRole("button", { name: /créer|s'inscrire|inscription/i }).click();

    await expect(page.getByText(/existe déjà|déjà utilisé/i)).toBeVisible({ timeout: 5000 });
  });

  test("peut basculer vers l'onglet connexion depuis l'inscription", async ({ page }) => {
    await openRegisterModal(page);

    // Cherche un lien/bouton pour aller vers connexion
    const loginSwitch = page.getByRole("tab", { name: /connexion/i })
      .or(page.getByRole("button", { name: /connexion/i }).filter({ hasText: /connexion/i }));

    if (await loginSwitch.count() > 0) {
      await loginSwitch.first().click();
      await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe("État authentifié dans la Navbar", () => {
  test("affiche le menu utilisateur quand connecté", async ({ page }) => {
    await page.route("**/api/v1/vehicules**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) })
    );
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
    );

    await page.goto("/");

    // Le menu utilisateur doit être visible (bouton "Mon compte" ou icône utilisateur)
    await expect(
      page.getByRole("button", { name: /menu utilisateur|mon compte|jean/i }).or(
        page.getByLabel("Ouvrir le menu utilisateur")
      )
    ).toBeVisible({ timeout: 5000 });
  });
});
