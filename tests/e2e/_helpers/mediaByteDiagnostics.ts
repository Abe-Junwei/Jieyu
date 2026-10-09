import { expect, type Page } from '@playwright/test';

/** 每条媒体行的字节诊断（与 docs 中浏览器控制台片段口径一致）| Per-row media byte diagnostic. */
export type MediaRowDiag = {
  id: string;
  textId: string;
  filename: string;
  timelineKind: string | null;
  byteLocation: string | null;
  availability: string | null;
  contentSha256: string | null;
  hasBlob: boolean;
  byteSize: number | null;
  mimeType: string | null;
  hasUrl: boolean;
  audioExportOmitted: boolean;
  unitCount: number;
};

export async function readMediaDiagnostics(page: Page, textId?: string): Promise<MediaRowDiag[]> {
  return page.evaluate(async (scopeTextId) => {
    type Row = {
      id: string;
      textId: string;
      filename: string;
      url?: string;
      details?: Record<string, unknown>;
      timelineKind?: string;
      byteLocation?: string;
      availability?: string;
      contentSha256?: string;
    };
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          media_items: { toArray: () => Promise<Row[]> };
          layer_units: {
            where: (k: string) => { equals: (v: string) => { count: () => Promise<number> } };
          };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const rows = (await dexie.media_items.toArray()).filter(
      (row) => scopeTextId === undefined || row.textId === scopeTextId,
    );
    const out = [];
    for (const row of rows) {
      const details = row.details ?? {};
      const blob = details['audioBlob'];
      out.push({
        id: row.id,
        textId: row.textId,
        filename: row.filename,
        timelineKind: row.timelineKind ?? null,
        byteLocation: row.byteLocation ?? null,
        availability: row.availability ?? null,
        contentSha256: row.contentSha256 ?? null,
        hasBlob: blob instanceof Blob,
        byteSize: blob instanceof Blob ? blob.size : null,
        mimeType: blob instanceof Blob ? blob.type : null,
        hasUrl: typeof row.url === 'string' && row.url.trim().length > 0,
        audioExportOmitted: details['audioExportOmitted'] === true,
        unitCount: await dexie.layer_units.where('mediaId').equals(row.id).count(),
      });
    }
    return out;
  }, textId);
}

/** 只接受「确认导出」对话框，拒绝加密与密码提示 | Accept export confirm, decline encryption. */
export function handleArchiveExportDialogs(page: Page): void {
  page.on('dialog', (dialog) => {
    const message = dialog.message();
    if (/password|密码/i.test(message)) {
      void dialog.dismiss();
      return;
    }
    void dialog.accept();
  });
}

export async function exportArchiveFromProjectHub(
  page: Page,
  kind: 'JYT' | 'JYM',
): Promise<Buffer> {
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  const entry = page
    .locator('.context-menu-submenu-export')
    .getByRole('menuitem', { name: new RegExp(kind, 'i') });
  await expect(entry).toBeVisible({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await entry.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`${kind} download stream missing`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * 第 3 批 JYT / JYM：通过项目中心恢复为新项目，或覆盖当前项目（覆盖要点两次）。
 * Batch 3 JYT / JYM through the project hub: restore as a new project, or overwrite (two clicks).
 */
export async function importProjectPackageViaProjectHub(
  page: Page,
  archive: Buffer,
  name: string,
  mode: 'restore-as-new' | 'overwrite-current',
): Promise<void> {
  const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym,.jyb"]');
  await input.setInputFiles({ name, mimeType: 'application/octet-stream', buffer: archive });
  const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if (mode === 'restore-as-new') {
    await dialog.getByRole('button', { name: /Restore as new project|恢复为新项目/i }).click();
  } else {
    await dialog.getByTestId('project-import-overwrite-current').check();
    await dialog
      .getByRole('button', { name: /^(Overwrite current project|覆盖当前项目)$/i })
      .click();
    await expect(dialog.getByTestId('project-import-overwrite-warning')).toBeVisible();
    await dialog.getByRole('button', { name: /Confirm overwrite|确认覆盖/i }).click();
  }
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}
