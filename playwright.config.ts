import { defineConfig, devices } from '@playwright/test';

/**
 * E2E：只跑 Chromium。产品交付桌面版（ADR-0063）；浏览器构建只作开发与测试，
 * `browserslist` 收到 Electron 44 随附的 Chromium 152。Firefox / WebKit 项目与每晚任务已随 #328 去掉。
 * #329 完成前，Chromium E2E 仍是合并门槛（`.github/workflows/e2e-pr.yml` 跑 `npm run test:e2e:chromium`）。
 * F4 session-sidecar 专用构建见 `playwright.session-sidecar.config.ts`。
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
  ],
  webServer: {
    // CI workflows (e2e-pr, nightly) run `npm run build` before Playwright; avoid a second build inside the 30s webServer budget.
    command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 60_000 : 180_000,
  },
});
