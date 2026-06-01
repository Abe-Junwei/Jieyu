import { test, expect } from '@playwright/test';

test.describe('离线状态提示 | Offline status banner', () => {
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
