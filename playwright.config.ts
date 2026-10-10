import { defineConfig, devices } from "@playwright/test";

/**
 * E2E asap (smoke) yang tidak memerlukan Supabase aktif: redirect gerbang, tampilan login, aksesibilitas dasar.
 * Alur login penuh membutuhkan proyek Supabase nyata (lihat docs/deployment.md, bagian "E2E dengan Supabase").
 * Chromium dari PLAYWRIGHT_BROWSERS_PATH dipakai bila ada (lingkungan tanpa unduhan browser).
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "id-ID", launchOptions: executablePath ? { executablePath } : {} } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "e2e-anon-key-placeholder-0000",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "e2e-service-key-placeholder-0000",
      APP_SECRET: process.env.APP_SECRET ?? "e2e-app-secret-e2e-app-secret-e2e-0000",
    },
  },
});
