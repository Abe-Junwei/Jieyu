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

    const importDialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(importDialog).toBeVisible({ timeout: 15_000 });
    await page.getByRole('radio', { name: /Replace all records|replace-all|全部替换/i }).click();
    await page.getByRole('button', { name: /Start project import|开始导入项目/i }).click();
    await expect(importDialog).toBeHidden({ timeout: 60_000 });

    await expect.poll(() => countLayerUnits(page)).toBeGreaterThanOrEqual(4);
    const textExists = await page.evaluate(async () => {
      const dexie = (globalThis as unknown as {
        __jieyuDexie__: { texts: { get: (id: string) => Promise<{ id: string } | undefined> } };
      }).__jieyuDexie__;
      const row = await dexie.texts.get('text_r4_s1');
      return row?.id === 'text_r4_s1';
    });
    expect(textExists).toBe(true);
  });

  test('S5：深链进入转写后 sessionStorage 返回提示可往返 | Deep link return hint round-trips', async ({ page }) => {
    await page.goto('/lexicon');
    await expect(page.locator('body')).toContainText(/词典工作台|Lexicon Workspace/);

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
