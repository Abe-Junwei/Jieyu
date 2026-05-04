import { defineConfig, devices } from '@playwright/test';

/**
 * F4 session-sidecar：依赖 **专用 vite build**（见 `npm run test:e2e:session-sidecar-audit`）。
 * 与默认 `playwright.config.ts` 分离，避免 `npm run test:e2e` 在无 VITE 注入时误跑本目录。
 */
export default defineConfig({
  testDir: './tests/e2e-sandbox',
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
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
