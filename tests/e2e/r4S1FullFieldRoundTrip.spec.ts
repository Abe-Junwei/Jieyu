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

      // 第 3 批：JYM 恢复为新项目（新 id、restoredFrom），录音字节随包带回
      // Batch 3: restored as a new project (new ids, restoredFrom) with the recording bytes
      const restored = await fresh.evaluate(async (sourceId) => {
        type Row = Record<string, unknown> & { id: string; textId?: string };
        const dexie = (globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            table: (n: string) => { toArray: () => Promise<Row[]> };
          };
        }).__jieyuDexie__;
        await dexie.open();
        const text = (await dexie.table('texts').toArray()).find(
          (row) => (row.restoredFrom as { projectId?: string } | undefined)?.projectId === sourceId,
        );
        if (!text) return null;
        const contents = (await dexie.table('layer_unit_contents').toArray())
          .filter((r) => r.textId === text.id)
          .map((r) => String(r.text ?? ''));
        const media = (await dexie.table('media_items').toArray()).filter((r) => r.textId === text.id);
        const blob = (media[0]?.details as { audioBlob?: unknown } | undefined)?.audioBlob;
        return { id: text.id, contents, mediaCount: media.length, hasBlob: blob instanceof Blob };
      }, project.textId);
      expect(restored).not.toBeNull();
      expect(restored!.id).not.toBe(project.textId);
      expect(restored!.contents).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']));
      expect(restored).toMatchObject({ mediaCount: 1, hasBlob: true });
    } finally {
      await fresh.close();
    }
  });
});
