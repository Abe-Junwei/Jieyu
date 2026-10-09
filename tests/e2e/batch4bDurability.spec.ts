/**
 * 第 4b 批 T44 浏览器端验收：第一次导入时伴随手势申请 persist 并记录结果；导入时出现
 * QuotaExceededError 只提示、不改不删已有数据；设置 → 数据 的诊断面板显示 estimate()、persist 结果与
 * Safari 提示；备份文件夹只保留最近 3 份。
 * Batch 4b T44 browser acceptance: persist() is requested with the first import gesture and
 * recorded; a QuotaExceededError during import is only reported and changes or deletes nothing;
 * the Settings → Data diagnostics panel shows estimate(), the persist result and the Safari note;
 * the backup folder keeps the newest 3.
 */
import { test, expect, type Page } from '@playwright/test';

import { handleArchiveExportDialogs, readMediaDiagnostics } from './_helpers/mediaByteDiagnostics';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

async function countTexts(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          table: (n: string) => { count: () => Promise<number> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    return dexie.table('texts').count();
  });
}

async function exportRawFromProjectHub(page: Page): Promise<Buffer> {
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page
    .locator('.context-menu-submenu-export')
    .getByRole('menuitem', { name: /原始恢复快照|raw recovery snapshot/i })
    .click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test.describe('Batch 4b durability | 第 4b 批存储耐久', () => {
  test('T44: persist on first import, quota error changes nothing, diagnostics and backup rotation', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    const raw = await exportRawFromProjectHub(page);
    const textsBefore = await countTexts(page);

    // 主库的每次写入都报配额不足 | Every write to the main database fails with a quota error
    await page.evaluate(() => {
      const proto = IDBObjectStore.prototype as unknown as Record<string, unknown>;
      const w = window as unknown as { __restoreIdb?: () => void };
      const originals = { put: proto.put, add: proto.add };
      for (const name of ['put', 'add'] as const) {
        const original = originals[name] as (...args: unknown[]) => IDBRequest;
        proto[name] = function (this: IDBObjectStore, ...args: unknown[]) {
          if (this.transaction.db.name === 'jieyu') {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          }
          return original.apply(this, args);
        };
      }
      w.__restoreIdb = () => Object.assign(proto, originals);
    });

    await page.locator('input.left-rail-project-hub-raw-snapshot-input').setInputFiles({
      name: 'raw.zip',
      mimeType: 'application/zip',
      buffer: raw,
    });
    const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog
      .getByRole('button', { name: /^(Import selected projects|导入所选项目)$/i })
      .click();
    await expect(page.getByText(/存储空间不足|Not enough storage space/).first()).toBeVisible({
      timeout: 30_000,
    });
    await page.evaluate(() => (window as unknown as { __restoreIdb: () => void }).__restoreIdb());

    // 什么都没改、没删 | Nothing changed or deleted
    expect(await countTexts(page)).toBe(textsBefore);
    const source = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(source?.hasBlob).toBe(true);

    // 第一次导入伴随手势申请了 persist，并记录了结果 | persist() was requested with the import gesture
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('jieyu.storage.persistRequest.v1') ?? 'null'),
    );
    expect(record).toMatchObject({ trigger: 'import' });
    expect(['granted', 'denied']).toContain(record.outcome);

    // 诊断面板 | Diagnostics panel
    await page.goto('/');
    await page
      .getByRole('button', { name: /Settings|设置/i })
      .first()
      .click();
    await page.getByRole('tab', { name: /^(数据|Data)$/ }).click();
    const panel = page.getByTestId('storage-diagnostics');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('storage-usage')).toContainText(/MiB.*%/);
    await expect(panel.getByTestId('storage-last-persist')).toContainText(/导入时|on import/);
    await expect(panel).toContainText(/ITP/);

    // 备份文件夹：用 OPFS 目录代替用户选的文件夹 | Backup folder: an OPFS directory stands in
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle('e2e-backups', { create: true });
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
        async () => folder;
    });
    await panel.getByRole('button', { name: /选择文件夹|Choose folder/ }).click();
    await expect(panel.getByTestId('backup-folder-name')).toHaveText('e2e-backups');
    await expect(panel.getByTestId('backup-folder-interval')).toHaveValue('24');
    const listBackups = () =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const folder = await root.getDirectoryHandle('e2e-backups');
        const out: string[] = [];
        for await (const name of (
          folder as unknown as { keys: () => AsyncIterable<string> }
        ).keys())
          if (/^jieyu-backup-.*\.jyb$/.test(name)) out.push(name);
        return out.sort();
      });
    const backupButton = panel.getByRole('button', { name: /立即备份|Back up now/ });
    for (let i = 0; i < 4; i += 1) {
      await backupButton.click();
      await expect
        .poll(async () => (await listBackups()).length, { timeout: 60_000 })
        .toBe(Math.min(i + 1, 3));
      await expect(backupButton).toBeEnabled({ timeout: 60_000 });
    }
    await expect(panel.getByTestId('backup-folder-last-success')).toContainText(
      /删除旧备份 1 份|removed 1 older/,
    );
    const afterManual = await listBackups();

    // 自动备份：上次成功是两天前，重新打开页面后到期即写，仍只保留 3 份
    // Scheduled backup: last success two days ago, so reopening the app writes one, still keeping 3
    await page.evaluate(() => {
      const key = 'jieyu.backup.folder.status.v1';
      const status = JSON.parse(localStorage.getItem(key) ?? '{}');
      status.lastSuccess.at = new Date(Date.now() - 48 * 3_600_000).toISOString();
      localStorage.setItem(key, JSON.stringify(status));
    });
    await page.reload();
    await expect
      .poll(async () => (await listBackups()).join(), { timeout: 60_000 })
      .not.toBe(afterManual.join());
    expect(await listBackups()).toHaveLength(3);
  });

  test('#5: a large JYM (160 MiB recording) streams through export and restore with sha256 intact', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    // 页面里合成一段 160 MiB 的录音换进去 | Swap in a synthetic 160 MiB recording inside the page
    const bigSha = await page.evaluate(
      async ({ id, size }) => {
        const dexie = (
          globalThis as unknown as {
            __jieyuDexie__: {
              open: () => Promise<unknown>;
              media_items: {
                get: (k: string) => Promise<Record<string, unknown>>;
                put: (row: Record<string, unknown>) => Promise<unknown>;
              };
            };
          }
        ).__jieyuDexie__;
        await dexie.open();
        const bytes = new Uint8Array(size);
        const words = new Uint32Array(bytes.buffer);
        for (let i = 0; i < words.length; i += 1) words[i] = Math.imul(i + 1, 2654435761);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const row = await dexie.media_items.get(id);
        await dexie.media_items.put({
          ...row,
          details: {
            ...(row.details as Record<string, unknown>),
            audioBlob: new Blob([bytes], { type: 'audio/wav' }),
          },
          contentSize: size,
          contentSha256: digest,
        });
        return digest;
      },
      { id: project.mediaId, size: 160 * 1024 * 1024 },
    );

    await page.locator('.left-rail-project-hub-btn').click();
    await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page
      .locator('.context-menu-submenu-export')
      .getByRole('menuitem', { name: /JYM/i })
      .click();
    const jymPath = testInfo.outputPath('large.jym');
    await (await downloadPromise).saveAs(jymPath);
    const { statSync } = await import('node:fs');
    expect(statSync(jymPath).size).toBeGreaterThan(160 * 1024 * 1024);

    const textsBefore = await countTexts(page);
    await page
      .locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym,.jyb"]')
      .setInputFiles(jymPath);
    const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: /Restore as new project|恢复为新项目/i }).click();
    await expect(dialog).toBeHidden({ timeout: 120_000 });
    await expect.poll(() => countTexts(page), { timeout: 30_000 }).toBe(textsBefore + 1);

    const restored = (await readMediaDiagnostics(page)).filter(
      (row) => row.contentSha256 === bigSha && row.id !== project.mediaId,
    );
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ hasBlob: true, byteSize: 160 * 1024 * 1024 });
    const restoredSha = await page.evaluate(async (id) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            media_items: { get: (k: string) => Promise<{ details?: { audioBlob?: Blob } }> };
          };
        }
      ).__jieyuDexie__;
      const blob = (await dexie.media_items.get(id)).details!.audioBlob!;
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }, restored[0]!.id);
    expect(restoredSha).toBe(bigSha);
  });
});
