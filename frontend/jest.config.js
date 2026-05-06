/**
 * Couverture : tout fichier sous collectCoverageFrom compte dans le % — un nouveau
 * module sans test fait baisser le global. Aligner le CI : `npm run test:ci`.
 */
const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  /** happy-dom : pas de chaîne jsdom/whatwg-encoding (avertissements npm deprecated en CI). */
  testEnvironment: "@happy-dom/jest-environment",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/standalone/"],
  /** Alias `@/` (tsconfig) pour `jest.mock` et le resolveur Jest, pas seulement le transform SWC. */
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/app/**/*.{ts,tsx}",
    "src/components/**/*.{ts,tsx}",
    "src/hooks/**/*.ts",
    "src/data/**/*.ts",
    "src/types/**/*.ts",
    "!src/**/*.d.ts",
    "!tests/**",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
