import type { Config } from "tailwindcss";

// Palet: navy, slate, putih, aksen teal (kontras AA pada teks utama).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#eef3fa", 100: "#d5e0f1", 200: "#a9bfe0", 500: "#2c4f86", 700: "#17335f", 800: "#102647", 900: "#0a1a33" },
        teal: { 50: "#e8f7f6", 100: "#c5ebe8", 500: "#14a09a", 600: "#0f857f", 700: "#0b6b66" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,38,71,.06), 0 1px 3px rgba(16,38,71,.08)" },
    },
  },
  plugins: [],
};
export default config;
