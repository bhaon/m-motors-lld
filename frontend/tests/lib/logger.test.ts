import { getLogger } from "@/lib/logger";

describe("getLogger", () => {
  it("émet un JSON info avec logger et message", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    getLogger("test-suite").info("hello", { route: "/x" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const obj = JSON.parse(line) as Record<string, unknown>;
    expect(obj["logger.name"]).toBe("test-suite");
    expect(obj.body).toBe("hello");
    expect(obj.route).toBe("/x");
    expect(obj.severityText).toBe("INFO");
    spy.mockRestore();
  });

  it("n’émet pas de debug en production", () => {
    // ProcessEnv typé rend NODE_ENV en lecture seule ; cast pour le test.
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    const spy = jest.spyOn(console, "debug").mockImplementation(() => {});
    getLogger("prod").debug("skip");
    expect(spy).not.toHaveBeenCalled();
    env.NODE_ENV = prev;
    spy.mockRestore();
  });
});
