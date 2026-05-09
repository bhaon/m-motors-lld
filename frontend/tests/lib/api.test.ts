import { apiBase, apiUrl } from "@/lib/api";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("apiBase", () => {
  it("retourne une chaîne vide si NEXT_PUBLIC_API_URL est absent", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(apiBase()).toBe("");
  });

  it("retourne l'URL sans slash final si NEXT_PUBLIC_API_URL est défini", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000/";
    expect(apiBase()).toBe("http://localhost:8000");
  });

  it("ne modifie pas une URL déjà sans slash final", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    expect(apiBase()).toBe("https://api.example.com");
  });
});

describe("apiUrl", () => {
  it("retourne le chemin relatif quand pas de NEXT_PUBLIC_API_URL", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(apiUrl("/api/v1/dossiers")).toBe("/api/v1/dossiers");
  });

  it("préfixe l'URL de base quand NEXT_PUBLIC_API_URL est défini", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    expect(apiUrl("/api/v1/dossiers")).toBe("http://localhost:8000/api/v1/dossiers");
  });
});
