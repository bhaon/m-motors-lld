/** Aligné sur `RegisterRequest` (auth) : 12+, majuscule, chiffre, caractère non alphanumérique. */
const REGISTER_PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

/**
 * Indique si le mot de passe respecte la politique d’inscription client (côté UI).
 */
export function isPasswordStrong(password: string): boolean {
  return REGISTER_PASSWORD_RE.test(password);
}

/**
 * Valide le mot de passe pour la création d’un utilisateur par un admin.
 * @returns message d’erreur à afficher, ou `null` si valide.
 */
export function validateAdminPassword(password: string): string | null {
  if (!password) return "Mot de passe obligatoire.";
  if (password.length < 8) {
    return "Au moins 8 caractères.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Au moins une majuscule.";
  }
  if (!/\d/.test(password)) {
    return "Au moins un chiffre.";
  }
  if (!/[!@#$%^&*\-_+=?]/.test(password)) {
    return "Au moins un caractère spécial (!@#$%^&*-_+=?).";
  }
  return null;
}
