/**
 * R-B：双 tab 共享 IndexedDB — 同项目语段内容跨 tab 可见（本地协作数据面）。
 */
import { test, expect } from '@playwright/test';

import {
  readSegmentText,
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

test.describe('R-B dual tab IndexedDB | Local collaboration data plane', () => {
  test('tab B sees tab A segment edit after reload', async ({ page, context }) => {
    test.setTimeout(120_000);

    const project = await setupFieldProjectWithMediaAndSegments(page);
    const deepLink = `/transcription?textId=${project.textId}&mediaId=${project.mediaId}`;

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
      { segmentId: 'seg_e2e_a', layerId: project.layerId, nextText: 'tab-a-edit' },
    );

    const pageB = await context.newPage();
    try {
      await pageB.goto(deepLink);
      await expect(pageB.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
      await waitForDexie(pageB);
      expect(await readSegmentText(pageB, 'seg_e2e_a', project.layerId)).toBe('tab-a-edit');

      await pageB.evaluate(
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
        { segmentId: 'seg_e2e_a', layerId: project.layerId, nextText: 'tab-b-edit' },
      );

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
      expect(await readSegmentText(page, 'seg_e2e_a', project.layerId)).toBe('tab-b-edit');
    } finally {
      await pageB.close();
    }
  });
});
