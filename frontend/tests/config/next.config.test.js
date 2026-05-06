const nextConfig = require("../../next.config.js");

describe("next.config", () => {
  it("expose standalone et les remotePatterns Unsplash", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.images.remotePatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocol: "https",
          hostname: "images.unsplash.com",
          pathname: "/**",
        }),
      ]),
    );
  });
});
