import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 180000,
  use: { baseURL: "http://localhost:5173", headless: true },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
