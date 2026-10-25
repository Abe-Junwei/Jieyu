import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';
import { exportArchiveFromProjectHub } from './_helpers/mediaByteDiagnostics';

// Playwright's fresh context owns this database; never attach a user profile.
async function readProjectData(page: Page) {
  return page.evaluate(async () => {
    const db = (
      globalThis as unknown as {
        __jieyuDexie__: {
          table: (name: string) => { toArray: () => Promise<unknown[]> };
        };
      }
    ).__jieyuDexie__;
    const rows = await Promise.all(
      [
        'texts',
        'media_items',
        'tier_definitions',
        'layer_units',
        'layer_unit_contents',
        'annotation_documents',
        'source_records',
      ].map(async (name) => [name, await db.table(name).toArray()]),
    );
    return JSON.stringify(rows, (_key, value: unknown) =>
      value instanceof Blob ? { size: value.size, type: value.type } : value,
    );
  });
}

test('project import/export cancellation and failures preserve the isolated project', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const project = await setupFieldProjectWithMediaAndSegments(page);
  await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
  await waitForDexie(page);
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
  const before = await readProjectData(page);
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  // Open the real export menu and cancel its first confirmation.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  await page
    .locator('.context-menu-submenu-export')
    .getByRole('menuitem', { name: /JYM/i })
    .click();
  await expect(page.locator('.context-menu-submenu-export')).toBeHidden();
  expect(downloads).toEqual([]);
  expect(await readProjectData(page)).toBe(before);

  const acceptExport = (dialog: import('@playwright/test').Dialog) => {
    void (/password|密码/i.test(dialog.message()) ? dialog.dismiss() : dialog.accept());
  };
  page.on('dialog', acceptExport);
  const archive = await exportArchiveFromProjectHub(page, 'JYM');
  expect(unzipSync(new Uint8Array(archive))['META-INF/manifest.json']).toBeDefined();
  expect(downloads).toHaveLength(1);

  const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym,.jyb"]');
  const preview = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
  const file = { name: 'isolated.jym', mimeType: 'application/octet-stream', buffer: archive };
  await input.setInputFiles(file);
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect(preview).toBeHidden();
  expect(await readProjectData(page)).toBe(before);
  // The same file can be selected again after cancellation; Escape also cancels.
  await input.setInputFiles(file);
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();

  await input.setInputFiles({ ...file, name: 'broken.jym', buffer: Buffer.from('not a ZIP') });
  await expect(
    page.getByText(/Failed to preview project import|项目导入预览失败|预览.*失败/).first(),
  ).toBeVisible();
  await expect(preview).toBeHidden();
  expect(await readProjectData(page)).toBe(before);

  // Fail only the download click, inside this disposable browser context.
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) throw new Error('isolated-download-failure');
      click.call(this);
    };
  });
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  await page
    .locator('.context-menu-submenu-export')
    .getByRole('menuitem', { name: /JYM/i })
    .click();
  await expect(
    page
      .getByText(/导出失败.*isolated-download-failure|Export failed.*isolated-download-failure/)
      .first(),
  ).toBeVisible();
  expect(downloads).toHaveLength(1);
  await page.reload();
  await waitForDexie(page);
  expect(await readProjectData(page)).toBe(before);
});

test('annotation import cancellation and malformed input preserve the isolated project', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const project = await setupFieldProjectWithMediaAndSegments(page);
  await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
  await waitForDexie(page);
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
  const before = await readProjectData(page);
  const input = page.locator('input.left-rail-project-hub-file-input[accept^=".eaf"]');
  const dialog = page.getByRole('dialog', { name: /Import annotation files|导入标注文件/ });
  const file = { name: 'broken.eaf', mimeType: 'text/xml', buffer: Buffer.from('<broken>') };
  await input.setInputFiles(file);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect(dialog).toBeHidden();
  expect(await readProjectData(page)).toBe(before);
  await input.setInputFiles(file);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await input.setInputFiles(file);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /开始导入标注|Start annotation import/ }).click();
  await expect(page.getByText(/导入失败|Import failed/).first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Cancel|取消)$/ })).toBeEnabled();
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await page.reload();
  await waitForDexie(page);
  expect(await readProjectData(page)).toBe(before);
});
