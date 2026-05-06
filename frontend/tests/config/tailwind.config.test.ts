import config from "../../tailwind.config";

describe("tailwind.config", () => {
  it("pointe vers src et étend couleurs / typo / ombres", () => {
    expect(config.content).toEqual(
      expect.arrayContaining([
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
      ]),
    );
    expect(config.theme?.extend?.colors).toMatchObject({
      gold: "#F4A024",
      navy: { DEFAULT: "#0D1B4B", 2: "#1a2d6b" },
    });
    expect(config.theme?.extend?.fontFamily).toMatchObject({
      syne: ["Syne", "sans-serif"],
      dm: ["DM Sans", "sans-serif"],
    });
    expect(config.theme?.extend?.boxShadow).toMatchObject({
      card: "0 2px 16px rgba(13,27,75,0.10)",
    });
  });
});
