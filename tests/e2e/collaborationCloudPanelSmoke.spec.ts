import { test, expect } from '@playwright/test';

import { trackPageErrors } from './_helpers/pageErrorFilter';

test.describe('协同云面板烟测 | Collaboration cloud panel smoke', () => {
  test('本地协同面板可打开并刷新基础标签页 | local collaboration panel opens and refreshes base tabs', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await page.getByRole('button', { name: /协同云|Collaboration Cloud/i }).click();
    const dialog = page.getByRole('dialog', { name: /协同云|Collaboration Cloud/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await expect(dialog.getByRole('tab', { name: /素材|Assets/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /快照|Snapshots|Versions/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /时间线|Timeline/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /目录|Directory/i })).toHaveCount(0);

    await dialog.getByRole('button', { name: /刷新素材|Refresh assets/i }).click();
    await expect(dialog.locator('.app-side-pane-collaboration-status')).toContainText(/0|零|loaded/i, {
      timeout: 10_000,
    });

    await dialog.getByRole('tab', { name: /快照|Snapshots|Versions/i }).click();
    await dialog.getByRole('button', { name: /刷新快照|Refresh snapshots|Refresh Versions/i }).click();
    await expect(dialog.locator('.app-side-pane-collaboration-status')).toContainText(/0|零|loaded/i, {
      timeout: 10_000,
    });

    await dialog.getByRole('tab', { name: /时间线|Timeline/i }).click();
    await dialog.getByRole('button', { name: /刷新时间线|Refresh timeline/i }).click();
    await expect(dialog.locator('.app-side-pane-collaboration-status')).toContainText(/0|零|loaded/i, {
      timeout: 10_000,
    });

    expect(errors).toHaveLength(0);
  });
});
