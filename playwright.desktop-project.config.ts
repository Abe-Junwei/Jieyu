import { defineConfig } from '@playwright/test';

/** Electron proof for the one-sqlite folder flow. Not the Chromium merge gate. */
export default defineConfig({
  testDir: './tests/e2e-desktop',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
});
