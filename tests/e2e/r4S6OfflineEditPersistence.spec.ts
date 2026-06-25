/**
 * R4 S6：断网期间编辑语段文本，本地 Dexie 仍持久化。
 */
import { test, expect } from '@playwright/test';

import {
  readSegmentText,
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

test.describe('R4 S6 offline edit persistence | Offline segment edit', () => {
  test('persists segment text to Dexie while offline', async ({ page, context }) => {
    test.setTimeout(120_000);

    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.goto(
      `/transcription?textId=${project.textId}&mediaId=${project.mediaId}&unitId=seg_e2e_a&unitKind=segment`,
    );
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(2000);

    try {
      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
      await expect(page.getByTestId('app-offline-status')).toContainText(/当前离线|Offline\./);

      await page.evaluate(
        async ({ segmentId, layerId, nextText }) => {
          const dexie = (globalThis as unknown as {
            __jieyuDexie__: {
              open: () => Promise<unknown>;
              layer_unit_contents: {
                where: (k: string) => { equals: (v: string) => { toArray: () => Promise<Array<Record<string, unknown>>> } };
                put: (row: Record<string, unknown>) => Promise<string>;
              };
            };
          }).__jieyuDexie__;
          await dexie.open();
          const rows = await dexie.layer_unit_contents.where('unitId').equals(segmentId).toArray();
          const row = rows.find((item) => item.layerId === layerId);
          if (!row) throw new Error('content row missing');
          await dexie.layer_unit_contents.put({ ...row, text: nextText, updatedAt: new Date().toISOString() });
        },
        { segmentId: 'seg_e2e_a', layerId: project.layerId, nextText: 'offline-persisted-edit' },
      );

      await waitForDexie(page);
      expect(await readSegmentText(page, 'seg_e2e_a', project.layerId)).toBe('offline-persisted-edit');
    } finally {
      await context.setOffline(false);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
      await expect(page.getByTestId('app-offline-status')).toBeHidden({ timeout: 15_000 });
    }
  });
});
