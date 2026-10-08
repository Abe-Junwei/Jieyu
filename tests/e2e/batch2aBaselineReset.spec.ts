/**
 * Batch 2A 浏览器验证：T56 开发期提示、T2 确认删除旧数据、T47 拒绝后新库照常工作。
 * Batch 2A browser checks: T56 dev-build banner, T2 confirm wipe, T47 decline keeps new DB working.
 */
import { test, expect, type Page } from '@playwright/test';

import { trackPageErrors } from './_helpers/pageErrorFilter';

async function seedLegacyData(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const create = (name: string, version: number) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('legacy_rows')) {
            request.result.createObjectStore('legacy_rows', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    await create('jieyudb_v2', 540);
    await create('jieyu_pre_migration_backups', 1);
    await create('jieyu-voice-sessions-e2e-probe', 1);
    localStorage.setItem('jieyu.backup.preMigrationSnapshot:jieyudb_v2:53:54', '{}');
    localStorage.setItem('jieyu.lastExportTimestamp', '1700000000000');
    localStorage.setItem('jieyu-theme', 'dark');
    // 未列入清单的键必须保留（AI 设置键会被 keyVault 自行规范化，这里用一个不被应用改写的键）
    // Unlisted keys must survive (the AI settings key is normalised by keyVault, so use an inert key)
    localStorage.setItem('jieyu.e2e.unlistedPreference', 'keep');
  });
}

async function databaseNames(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await indexedDB.databases()).map((info) => info.name ?? '').sort(),
  );
}

test.describe('Batch 2A 基线重置 | Batch 2A baseline reset', () => {
  test('T56: 开发期版本提示常驻 | dev-build banner is shown', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByTestId('app-dev-build-banner')).toContainText(
      /开发期版本：数据可能被重置|Development build: data may be reset/,
    );
    await expect(page.getByTestId('legacy-data-reset-dialog')).toHaveCount(0);
    expect(await databaseNames(page)).toContain('jieyu');
    expect(await databaseNames(page)).not.toContain('jieyudb_v2');
    expect(errors).toHaveLength(0);
  });

  test('T2: 确认后只删除旧库与清单键 | confirm deletes only the listed DBs and keys', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = trackPageErrors(page);
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await seedLegacyData(page);
    await page.reload();

    const dialog = page.getByTestId('legacy-data-reset-dialog');
    await expect(dialog).toBeVisible({ timeout: 25_000 });
    await expect(dialog.getByTestId('legacy-data-reset-db-list')).toContainText('jieyudb_v2');
    await expect(dialog.getByTestId('legacy-data-reset-db-list')).toContainText(
      'jieyu_pre_migration_backups',
    );

    await dialog.getByRole('button', { name: /删除旧数据|Delete old data/ }).click();
    await page.waitForLoadState('load');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByTestId('legacy-data-reset-dialog')).toHaveCount(0);

    // 只有 2A 之前才会出现的两个库必须消失；其余三个库会被新版本按需以 version(1) 重建
    // The two pre-2A-only DBs must be gone; the other three may be recreated at version(1) on demand
    await expect
      .poll(async () =>
        (await databaseNames(page)).filter(
          (name) => name === 'jieyudb_v2' || name === 'jieyu_pre_migration_backups',
        ),
      )
      .toEqual([]);
    const names = await databaseNames(page);
    expect(names).toContain('jieyu');
    expect(names).toContain('jieyu-voice-sessions-e2e-probe');

    const storage = await page.evaluate(() => ({
      snapshot: localStorage.getItem('jieyu.backup.preMigrationSnapshot:jieyudb_v2:53:54'),
      theme: localStorage.getItem('jieyu-theme'),
      unlisted: localStorage.getItem('jieyu.e2e.unlistedPreference'),
    }));
    expect(storage.snapshot).toBeNull();
    expect(storage.theme).toBe('dark');
    expect(storage.unlisted).toBe('keep');

    await page.reload();
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByTestId('legacy-data-reset-dialog')).toHaveCount(0);
    expect(errors).toHaveLength(0);
  });

  test('T47: 拒绝后新库照常工作，旧库保留，下次再提示 | decline keeps everything and asks again', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = trackPageErrors(page);
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await seedLegacyData(page);
    await page.reload();

    const dialog = page.getByTestId('legacy-data-reset-dialog');
    await expect(dialog).toBeVisible({ timeout: 25_000 });
    await dialog.getByRole('button', { name: /暂不删除|Not now/ }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
    const names = await databaseNames(page);
    expect(names).toContain('jieyu');
    expect(names).toContain('jieyudb_v2');
    expect(
      await page.evaluate(() =>
        localStorage.getItem('jieyu.backup.preMigrationSnapshot:jieyudb_v2:53:54'),
      ),
    ).toBe('{}');

    await page.reload();
    await expect(page.getByTestId('legacy-data-reset-dialog')).toBeVisible({ timeout: 25_000 });
    expect(errors).toHaveLength(0);
  });
});
