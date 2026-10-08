import { test, expect } from '@playwright/test';

import { trackPageErrors } from './_helpers/pageErrorFilter';

test.describe('数据库 open 失败恢复入口 | DB open failure recovery entry', () => {
  test('浏览器自动化路径显示恢复遮罩并触发恢复按钮 | automation path shows recovery overlay without pre-migration restore', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = trackPageErrors(page);

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('html')).toHaveAttribute('data-jieyu-e2e-db-open-hook', '1', {
      timeout: 20_000,
    });

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('jieyu:e2e-db-open-failed', {
          detail: { reason: 'simulated IndexedDB open failure' },
        }),
      );
    });

    const overlay = page.getByRole('alertdialog', {
      name: /本地数据库无法打开|Local database could not be opened/i,
    });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay.getByText('simulated IndexedDB open failure')).toBeVisible();

    // 2A 删除了迁移前备份；遮罩只保留刷新 / 重试 / 继续 | 2A removed pre-migration backups
    await expect(
      overlay.getByRole('button', { name: /从迁移前备份恢复|Restore from pre-migration backup/i }),
    ).toHaveCount(0);
    await expect(overlay.getByRole('button', { name: /刷新页面|Reload/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});
