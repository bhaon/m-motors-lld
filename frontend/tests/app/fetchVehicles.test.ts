import { fetchVehicles, VehiclesApiError } from "@/app/fetchVehicles";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("fetchVehicles", () => {
  const original = process.env.NEXT_PUBLIC_API_URL;
  const originalInternal = process.env.API_INTERNAL_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = original;
    process.env.API_INTERNAL_URL = originalInternal;
    jest.restoreAllMocks();
  });

  it("appelle /api/v1/vehicules en même origine si NEXT_PUBLIC_API_URL est absent", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const apiVehicle = { ...SAMPLE_VEHICLES[0], id: 998 };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [apiVehicle] }),
    });

    await expect(fetchVehicles()).resolves.toEqual([apiVehicle]);
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/vehicules", {
      cache: "no-store",
    });
  });

  it("retourne les items API si NEXT_PUBLIC_API_URL est défini et la réponse est valide", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    const apiVehicle = { ...SAMPLE_VEHICLES[0], id: 999 };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [apiVehicle] }),
    });

    await expect(fetchVehicles()).resolves.toEqual([apiVehicle]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/v1/vehicules",
      { cache: "no-store" },
    );
  });

  it("lève VehiclesApiError si la réponse HTTP est en erreur", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 });

    await expect(fetchVehicles()).rejects.toBeInstanceOf(VehiclesApiError);
  });

  it("retourne un tableau vide si items est absent ou vide (base neuve)", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

    await expect(fetchVehicles()).resolves.toEqual([]);
    await expect(fetchVehicles()).resolves.toEqual([]);
  });

  it("lève VehiclesApiError en cas d'exception réseau", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));

    await expect(fetchVehicles()).rejects.toBeInstanceOf(VehiclesApiError);
  });
});
