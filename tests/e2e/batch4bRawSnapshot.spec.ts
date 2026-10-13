/**
 * 第 4b 批 T41 浏览器端验收：从项目中心导出原始恢复快照（raw-idb，含字节），再从“导入 → 从原始
 * 恢复快照导入”转换成当前版本的 JYB，按逐项目模式导入为新项目，音频字节完整。
 * Batch 4b T41 browser acceptance: export a raw recovery snapshot (raw-idb, bytes included) from
 * the project hub, then convert it via "Import > Import from a raw recovery snapshot" into a
 * current-version JYB and import it per project as a new project, audio bytes intact.
 */
import { test, expect, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

import { handleArchiveExportDialogs, readMediaDiagnostics } from './_helpers/mediaByteDiagnostics';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

async function openProject(page: Page, textId: string, mediaId: string): Promise<void> {
  await page.goto(`/transcription?textId=${textId}&mediaId=${mediaId}`);
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
}

async function readTexts(page: Page): Promise<Array<Record<string, unknown> & { id: string }>> {
  return page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          table: (n: string) => { toArray: () => Promise<Array<Record<string, unknown>>> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    return (await dexie.table('texts').toArray()) as Array<
      Record<string, unknown> & { id: string }
    >;
  });
}

async function exportRawFromProjectHub(page: Page): Promise<Buffer> {
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  const entry = page
    .locator('.context-menu-submenu-export')
    .getByRole('menuitem', { name: /原始恢复快照|raw recovery snapshot/i });
  await expect(entry).toBeVisible({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await entry.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^jieyu-raw-recovery-jieyu-n10-.*\.zip$/);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('raw snapshot download stream missing');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test.describe('Batch 4b raw snapshot | 第 4b 批原始快照', () => {
  test('T41: raw export → convert to JYB → per-project import as a new project with bytes', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);

    const raw = await exportRawFromProjectHub(page);
    const files = unzipSync(new Uint8Array(raw));
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as {
      kind: string;
      dbName: string;
      nativeVersion: number;
      binaryFileCount: number;
      reason: string;
    };
    expect(manifest).toMatchObject({
      kind: 'raw-idb',
      dbName: 'jieyu',
      nativeVersion: 10,
      reason: 'manual',
    });
    expect(manifest.binaryFileCount).toBeGreaterThan(0);
    expect(Object.keys(files).some((name) => name.startsWith('blobs/'))).toBe(true);

    const textsBefore = await readTexts(page);
    await page.locator('input.left-rail-project-hub-raw-snapshot-input').setInputFiles({
      name: 'raw.zip',
      mimeType: 'application/zip',
      buffer: raw,
    });
    const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByTestId('jyb-import-options')).toBeVisible();
    await expect(dialog.getByTestId('jyb-mode-projects')).toBeChecked();
    for (const text of textsBefore) {
      if (text.id !== project.textId) {
        await dialog.getByTestId(`jyb-project-${text.id}`).uncheck();
      }
    }
    await expect(dialog.getByTestId(`jyb-project-${project.textId}`)).toBeChecked();
    await dialog
      .getByRole('button', { name: /^(Import selected projects|导入所选项目)$/i })
      .click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect
      .poll(async () => (await readTexts(page)).length, { timeout: 15_000 })
      .toBe(textsBefore.length + 1);
    const restored = (await readTexts(page)).find((t) => !textsBefore.some((b) => b.id === t.id))!;
    expect(restored.restoredFrom).toMatchObject({
      projectId: project.textId,
      packageKind: 'jyb',
    });
    const media = await readMediaDiagnostics(page, restored.id);
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ hasBlob: true, timelineKind: 'acoustic' });
    // 原项目与原始快照都不变 | Source project untouched
    const source = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(source?.hasBlob).toBe(true);
  });
});
