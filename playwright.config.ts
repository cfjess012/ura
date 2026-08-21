import { defineConfig } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: variables come from the environment (CI).
}

const PORT = 3101;

/**
 * The suite brings its own server and its own database (F11). Running it
 * must never leave rows in the database a person demos from, and must never
 * depend on a dev server someone remembered to start.
 */
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/projects`,
    // Never reuse: the database binding lives in this block, so reusing a
    // server someone else started would silently point the suite at the
    // development database — the very thing this config exists to prevent
    // (N9). Costs one cold start per run.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
