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

  it("ajoute un slash si le chemin ne commence pas par /", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    expect(apiUrl("api/v1/x")).toBe("http://localhost:8000/api/v1/x");
  });
});

describe("apiBase sans window (SSR Node)", () => {
  const originalWindow = globalThis.window;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("utilise API_INTERNAL_URL en priorité", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.API_INTERNAL_URL = "http://internal:9000/";
    expect(apiBase()).toBe("http://internal:9000");
  });

  it("sinon NEXT_PUBLIC_API_URL", () => {
    delete process.env.API_INTERNAL_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.prod/";
    expect(apiBase()).toBe("https://api.prod");
  });

  it("sinon fallback production", () => {
    delete process.env.API_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "production";
    expect(apiBase()).toBe("http://backend");
  });

  it("sinon fallback développement", () => {
    delete process.env.API_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NODE_ENV = "development";
    expect(apiBase()).toBe("http://127.0.0.1:8000");
  });
});
