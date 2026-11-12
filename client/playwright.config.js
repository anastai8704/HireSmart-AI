// Browser end-to-end tests (Requirement 18). Runs against the real API and the real UI on a DISPOSABLE database.
//
//   E2E_MONGO_URI   mongodb://127.0.0.1:27017/hiresmart_e2e   (must contain "e2e"; re-seeded on every run)
//   DEMO_PASSWORD   the demo password used to seed (at least 12 characters; set per run, never committed)
//   E2E_CHROMIUM_PATH  optional path to a Chromium binary (local sandboxes only; CI uses Playwright's own browser)
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5173;
const API_PORT = 5000;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/start-backend.js",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
