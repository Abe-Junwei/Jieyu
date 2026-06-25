/**
 * R4 S1 完整 UI 链：wav 导入 → 转写层 → 3 语段 → JYM 导出 → 新 tab 导入。
 */
import { test, expect } from '@playwright/test';

import {
  importJymArchive,
  readSegmentText,
  setupFieldProjectWithMediaAndSegments,
  exportJymArchive,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

test.describe('R4 S1 full field round-trip | Full JYM UI chain', () => {
  test('imports wav, seeds segments, exports JYM, re-imports in fresh tab', async ({ page, context }) => {
    test.setTimeout(180_000);

    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    expect(await readSegmentText(page, 'seg_e2e_b', project.layerId)).toBe('beta');

    const archive = await exportJymArchive(page);
    expect(archive.byteLength).toBeGreaterThan(100);

    const fresh = await context.newPage();
    try {
      await fresh.goto('/transcription');
      await expect(fresh.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
      await importJymArchive(fresh, archive);
      await waitForDexie(fresh);

      const textAfterImport = await readSegmentText(fresh, 'seg_e2e_c', project.layerId);
      expect(textAfterImport).toBe('gamma');

      const mediaCount = await fresh.evaluate(async () => {
        const dexie = (globalThis as unknown as {
          __jieyuDexie__: { open: () => Promise<unknown>; media_items: { count: () => Promise<number> } };
        }).__jieyuDexie__;
        await dexie.open();
        return dexie.media_items.count();
      });
      expect(mediaCount).toBeGreaterThanOrEqual(1);
    } finally {
      await fresh.close();
    }
  });
});
