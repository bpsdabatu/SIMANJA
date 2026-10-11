import type { Config } from "tailwindcss";

// Palet diturunkan dari logo SIMASPRAJA: biru tua (kepercayaan, institusional) + emas (aksen).
// "teal" dipertahankan sebagai alias aksen primer agar komponen lama tetap konsisten,
// tetapi nilainya kini biru logo; "gold" adalah aksen sekunder.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eff4fa", 100: "#dbe6f3", 200: "#b3c8e3", 300: "#85a5cf", 400: "#4f7bb3",
          500: "#2a5c96", 600: "#1b4b81", 700: "#143d6b", 800: "#0e2e52", 900: "#0a2140", 950: "#061529",
        },
        teal: {
          50: "#eff5fb", 100: "#d9e7f5", 500: "#2a6bb0", 600: "#1b4b81", 700: "#143d6b",
        },
        gold: {
          50: "#fbf6e9", 100: "#f4e8c4", 200: "#ead28c", 300: "#dcb95f", 400: "#cfa54a",
          500: "#c29d4d", 600: "#a47f33", 700: "#82622a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,33,64,.05), 0 4px 16px -4px rgba(10,33,64,.08)",
        lift: "0 10px 30px -10px rgba(10,33,64,.25)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
      },
      animation: { "fade-up": "fade-up .5s ease-out both" },
    },
  },
  plugins: [],
};
export default config;
