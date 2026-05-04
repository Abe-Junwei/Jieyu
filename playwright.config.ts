import { defineConfig, devices } from '@playwright/test';

/**
 * E2E：Chromium / Firefox / WebKit 三引擎，与 `docs/architecture/桌面端浏览器支持策略.md` 一致。
 * CI：作业 **`e2e-critical-paths`** 跑三引擎 `npm run test:e2e`（见 `.github/workflows/ci.yml`）。F4 session-sidecar 专用构建见 `playwright.session-sidecar.config.ts` + `npm run test:e2e:session-sidecar-audit`。本地快速循环：`npx playwright test --project=chromium` 或 `npm run test:e2e:chromium`。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
