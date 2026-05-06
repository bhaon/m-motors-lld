import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0D1B4B", 2: "#1a2d6b" },
        cyan: { DEFAULT: "#00B4D8", 2: "#0090b0" },
        gold: "#F4A024",
        off: "#F7F8FC",
        muted: "#6B7280",
        bdr: "#E5E7EB",
      },
      fontFamily: {
        syne: ["Syne", "sans-serif"],
        dm: ["DM Sans", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 16px rgba(13,27,75,0.10)",
        "card-hover": "0 8px 28px rgba(13,27,75,0.14)",
      },
      borderRadius: { card: "12px" },
    },
  },
  plugins: [],
};
export default config;
