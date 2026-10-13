import { test, expect } from '@playwright/test';

test.describe('离线状态提示 | Offline status banner', () => {
  test('Service Worker 生效后可冷启动转写主路径 | cold-opens transcription after Service Worker activation', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await page.close();
    await context.setOffline(true);
    try {
      const offlinePage = await context.newPage();
      await offlinePage.goto('/transcription');
      await expect(offlinePage.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    } finally {
      await context.setOffline(false);
    }
  });

  test('断网后提示离线且本地转写工作区仍可读 | shows offline status while local workspace remains readable', async ({ page, context }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    try {
      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
      await expect(page.getByTestId('app-offline-status')).toContainText(/当前离线|Offline\./);
      await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();

      await context.setOffline(false);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
      await expect(page.getByTestId('app-offline-status')).toBeHidden();
    } finally {
      await context.setOffline(false);
    }
  });
});
