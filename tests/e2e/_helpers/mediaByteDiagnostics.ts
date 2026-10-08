import { expect, type Page } from '@playwright/test';

/** 每条媒体行的字节诊断（与 docs 中浏览器控制台片段口径一致）| Per-row media byte diagnostic. */
export type MediaRowDiag = {
  id: string;
  textId: string;
  filename: string;
  timelineKind: string | null;
  placeholderFlag: boolean;
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
        timelineKind:
          typeof details['timelineKind'] === 'string' ? (details['timelineKind'] as string) : null,
        placeholderFlag: details['placeholder'] === true,
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

export async function importArchiveViaProjectHub(
  page: Page,
  archive: Buffer,
  name: string,
  strategy: 'upsert' | 'replace-all',
): Promise<void> {
  const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym"]');
  await input.setInputFiles({ name, mimeType: 'application/octet-stream', buffer: archive });
  const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const radioName =
    strategy === 'upsert'
      ? /Overwrite conflicts|覆盖冲突项|upsert/i
      : /Replace all records|全量替换|replace-all/i;
  await page.getByRole('radio', { name: radioName }).click();
  await page.getByRole('button', { name: /Start project import|开始导入项目/i }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}
