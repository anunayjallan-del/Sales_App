import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3000"
  },
  webServer: {
    command: "pnpm start",
    port: 3000,
    timeout: 120_000,
    reuseExistingServer: true,
    cwd: __dirname
  }
});
