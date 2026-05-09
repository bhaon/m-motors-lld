import { isPasswordStrong, validateAdminPassword } from "@/lib/validation";

describe("isPasswordStrong (US-02-01 — auto-inscription, ≥ 12 chars)", () => {
  it("accepte un mot de passe conforme", () => {
    expect(isPasswordStrong("Passw0rd!xYz")).toBe(true);
  });
  it("rejette un mot de passe trop court (< 12)", () => {
    expect(isPasswordStrong("Pass1!")).toBe(false);
  });
  it("rejette sans majuscule", () => {
    expect(isPasswordStrong("passw0rd!xyz1")).toBe(false);
  });
  it("rejette sans chiffre", () => {
    expect(isPasswordStrong("Password!xyzAB")).toBe(false);
  });
  it("rejette sans caractère spécial", () => {
    expect(isPasswordStrong("Password12345678")).toBe(false);
  });
});

describe("validateAdminPassword (admin — ≥ 8 chars)", () => {
  it("retourne null pour un mot de passe conforme", () => {
    expect(validateAdminPassword("Admin1!x")).toBeNull();
  });
  it("retourne un message si < 8 caractères", () => {
    expect(validateAdminPassword("Ab1!")).toMatch(/8/);
  });
  it("retourne un message si pas de majuscule", () => {
    expect(validateAdminPassword("admin1!x")).toMatch(/majuscule/i);
  });
  it("retourne un message si pas de chiffre", () => {
    expect(validateAdminPassword("Admin!xxx")).toMatch(/chiffre/i);
  });
  it("retourne un message si pas de caractère spécial", () => {
    expect(validateAdminPassword("Admin1xxx")).toMatch(/spécial/i);
  });
});
