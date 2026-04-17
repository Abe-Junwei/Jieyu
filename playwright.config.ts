import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 最小集配置：仅 Chromium，覆盖关键路径（首屏、转写、导航）。
 * Minimal E2E config: Chromium only, covers critical paths (shell, transcription, navigation).
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
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
