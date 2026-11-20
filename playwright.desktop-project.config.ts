import { defineConfig } from '@playwright/test';

// Test Electron windows stay hidden and never take focus; set to 0 to watch them.
process.env.JIEYU_DESKTOP_HIDE_WINDOW ??= '1';

/** Electron proof for the one-sqlite folder flow. Runs in CI as `desktop-flow` (electron-smoke.yml). */
export default defineConfig({
  testDir: './tests/e2e-desktop',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { screenshot: 'on' },
});
