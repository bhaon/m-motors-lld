/** @jest-environment node */

import { fetchVehicles } from "@/app/fetchVehicles";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("fetchVehicles (SSR)", () => {
  const original = process.env.NEXT_PUBLIC_API_URL;
  const originalInternal = process.env.API_INTERNAL_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = original;
    process.env.API_INTERNAL_URL = originalInternal;
    jest.restoreAllMocks();
  });

  it("appelle API_INTERNAL_URL sans NEXT_PUBLIC_API_URL côté Node", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.API_INTERNAL_URL = "http://internal.test";
    const apiVehicle = { ...SAMPLE_VEHICLES[0], id: 701 };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [apiVehicle] }),
    });

    await expect(fetchVehicles()).resolves.toEqual([apiVehicle]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://internal.test/api/v1/vehicules",
      { cache: "no-store" },
    );
  });

  it("utilise http://127.0.0.1:8000 par défaut côté Node hors production", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.API_INTERNAL_URL;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ ...SAMPLE_VEHICLES[0], id: 702 }] }),
    });

    await fetchVehicles();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/vehicules",
      { cache: "no-store" },
    );
  });

  it("priorise API_INTERNAL_URL sur NEXT_PUBLIC_API_URL en SSR (Docker)", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    process.env.API_INTERNAL_URL = "https://backend.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ ...SAMPLE_VEHICLES[0], id: 703 }] }),
    });

    await fetchVehicles();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://backend.test/api/v1/vehicules",
      { cache: "no-store" },
    );
  });

  it("utilise NEXT_PUBLIC_API_URL en SSR si API_INTERNAL_URL est absent", async () => {
    delete process.env.API_INTERNAL_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://api-host.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ ...SAMPLE_VEHICLES[0], id: 704 }] }),
    });

    await fetchVehicles();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api-host.test/api/v1/vehicules",
      { cache: "no-store" },
    );
  });
});
