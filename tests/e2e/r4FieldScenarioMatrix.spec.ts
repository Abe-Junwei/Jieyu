/**
 * R4 场景矩阵（田野剧本 S1–S7）— Chromium 深度手测自动化子集
 *
 * 与 `docs/execution/audits/全链路排错台账-2026-06-10.md` R4 表对齐。
 */
import { test, expect } from '@playwright/test';

import { buildMinimalJymArchiveBytes } from './_helpers/jymArchiveFixture';

async function waitForDexie(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } }).__jieyuDexie__),
    { timeout: 25_000 },
  );
}

async function countLayerUnits(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__: { open: () => Promise<unknown>; layer_units: { count: () => Promise<number> } };
    }).__jieyuDexie__;
    await dexie.open();
    return dexie.layer_units.count();
  });
}

test.describe('R4 场景矩阵 | Field scenario matrix', () => {
  test('S1：JYM 导入后 Dexie 含 3 语段 | JYM import restores three segments in Dexie', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await waitForDexie(page);

    const archiveInput = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym"]');
    await archiveInput.setInputFiles({
      name: 'r4-field-sample.jym',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(buildMinimalJymArchiveBytes()),
    });

    // 第 3 批：JYM 恢复为新项目，id 重新分配，restoredFrom 指回原项目
    // Batch 3: the JYM restores as a new project with new ids and restoredFrom
    const importDialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(importDialog).toBeVisible({ timeout: 15_000 });
    await expect(importDialog.getByTestId('project-import-bytes-included')).toBeVisible();
    await importDialog.getByRole('button', { name: /Restore as new project|恢复为新项目/i }).click();
    await expect(importDialog).toBeHidden({ timeout: 60_000 });

    await expect.poll(() => countLayerUnits(page)).toBeGreaterThanOrEqual(4);
    const restored = await page.evaluate(async () => {
      type Row = Record<string, unknown> & { id: string; textId?: string };
      const dexie = (globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          table: (n: string) => { toArray: () => Promise<Row[]> };
        };
      }).__jieyuDexie__;
      await dexie.open();
      const text = (await dexie.table('texts').toArray()).find(
        (row) => (row.restoredFrom as { projectId?: string } | undefined)?.projectId === 'text_r4_s1',
      );
      if (!text) return null;
      const media = (await dexie.table('media_items').toArray()).filter((r) => r.textId === text.id);
      const segments = (await dexie.table('layer_units').toArray()).filter(
        (r) => r.textId === text.id && r.unitType === 'segment',
      );
      const blob = (media[0]?.details as { audioBlob?: unknown } | undefined)?.audioBlob;
      return {
        id: text.id,
        segments: segments.length,
        mediaCount: media.length,
        hasBlob: blob instanceof Blob,
        byteLocation: media[0]?.byteLocation,
      };
    });
    expect(restored).not.toBeNull();
    expect(restored!.id).not.toBe('text_r4_s1');
    expect(restored).toMatchObject({
      segments: 3,
      mediaCount: 1,
      hasBlob: true,
      byteLocation: 'managed',
    });
  });

  test('S5：深链进入转写后 sessionStorage 返回提示可往返 | Deep link return hint round-trips', async ({ page }) => {
    // D11：没有活动项目时词典只显示“请先选择项目” | D11: without a project the lexicon shows the gate
    await page.goto('/lexicon');
    await expect(page.getByTestId('catalog-project-gate')).toBeVisible();

    await page.evaluate(() => {
      sessionStorage.setItem(
        'jieyu.workspace.transcriptionReturn.v1',
        JSON.stringify({ textId: 'text_r4_s1', mediaId: 'media_r4_s1' }),
      );
    });

    await page.goto('/transcription?textId=text_r4_s1&mediaId=media_r4_s1&unitId=seg_r4_s1_a&unitKind=segment');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const returnHref = await page.evaluate(() => {
      const raw = sessionStorage.getItem('jieyu.workspace.transcriptionReturn.v1');
      if (!raw) return null;
      const hint = JSON.parse(raw) as { textId?: string; mediaId?: string };
      const params = new URLSearchParams();
      if (hint.textId) params.set('textId', hint.textId);
      if (hint.mediaId) params.set('mediaId', hint.mediaId);
      const qs = params.toString();
      return qs.length > 0 ? `/transcription?${qs}` : '/transcription';
    });
    expect(returnHref).toContain('textId=text_r4_s1');
    expect(returnHref).toContain('mediaId=media_r4_s1');
  });
});
