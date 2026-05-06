const postcssConfig = require("../../postcss.config.js");

describe("postcss.config", () => {
  it("enregistre tailwindcss et autoprefixer", () => {
    expect(postcssConfig.plugins).toEqual({
      tailwindcss: {},
      autoprefixer: {},
    });
  });
});
