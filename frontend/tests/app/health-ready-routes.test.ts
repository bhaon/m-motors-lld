import { GET as getHealth } from "@/app/healthz/route";
import { GET as getReady } from "@/app/readyz/route";

describe("Health and Ready routes", () => {
  it("retourne 200 et status ok pour /healthz", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("retourne 200 et ready true pour /readyz", async () => {
    const response = await getReady();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ready: true });
  });
});
