import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f6f2",
        ink: "#1f2d1f",
        tea: "#5a7d3a",
        spice: "#b86f36"
      }
    }
  },
  plugins: []
};

export default config;
