import { defineConfig } from '@playwright/test';

// Local runs hide the window so it does not take focus. CI keeps it shown under Xvfb.
if (process.env.CI !== 'true') process.env.JIEYU_DESKTOP_HIDE_WINDOW ??= '1';

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
