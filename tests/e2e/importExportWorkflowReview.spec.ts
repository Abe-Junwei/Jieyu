import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
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
  await page.evaluate(async ({ textId, mediaId, layerId }) => {
    const db = (globalThis as any).__jieyuDexie__;
    const createdAt = '2099-06-10T00:00:00.000Z';
    await db.table('layer_units').put({
      id: 'unit_export_textgrid',
      textId,
      mediaId,
      layerId,
      unitType: 'unit',
      startTime: 0,
      endTime: 3,
      createdAt,
      updatedAt: createdAt,
    });
    await db.table('layer_unit_contents').put({
      id: 'cnt_unit_export_textgrid',
      textId,
      unitId: 'unit_export_textgrid',
      layerId,
      contentRole: 'primary_text',
      modality: 'text',
      text: 'export sample',
      sourceType: 'human',
      createdAt,
      updatedAt: createdAt,
    });
  }, project);
  await page.reload();
  await waitForDexie(page);
  const before = await readProjectData(page);
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  // Opening and cancelling media import must leave the isolated project intact.
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导入|Import/ }).hover();
  const mediaImport = page.getByRole('dialog', { name: /导入音视频|Import audio \/ video/i });
  await page
    .getByRole('menuitem', { name: /导入媒体|Import media/i })
    .click();
  await expect(mediaImport).toBeVisible();
  await expect(mediaImport.getByRole('button', { name: /^(取消|Cancel)$/ })).toBeEnabled();
  await mediaImport.getByRole('button', { name: /^(取消|Cancel)$/ }).click();
  await expect(mediaImport).toBeHidden();
  expect(await readProjectData(page)).toBe(before);
  expect(downloads).toEqual([]);

  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导入|Import/ }).hover();
  await page.getByRole('menuitem', { name: /导入媒体|Import media/i }).click();
  await mediaImport.locator('input.audio-import-dialog-file-input').setInputFiles({
    name: 'broken.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('not a WAV file'),
  });
  await expect(
    page.getByText(/Unable to read media duration|Unable to parse the media file/),
  ).toBeVisible();
  await expect(mediaImport.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  expect(await readProjectData(page)).toBe(before);
  await mediaImport.getByRole('button', { name: /^Cancel$/ }).click();
  await expect(mediaImport).toBeHidden();

  // A second text format should produce a readable download, not just close its menu.
  const [textGridDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    (async () => {
      await page.locator('.left-rail-project-hub-btn').click();
      await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
      await page
        .locator('.context-menu-submenu-export')
        .getByRole('menuitem', { name: /TextGrid/i })
        .click();
    })(),
  ]);
  const textGridPath = await textGridDownload.path();
  expect(textGridPath).toBeTruthy();
  const textGridContent = await readFile(textGridPath!, 'utf8');
  expect(textGridContent).toContain('ooTextFile');
  expect(textGridContent).toContain('export sample');
  expect(downloads).toEqual(['e2e-field-sample.TextGrid']);
  expect(await readProjectData(page)).toBe(before);

  for (const format of [
    { label: /ELAN|EAF/i, signature: 'ANNOTATION_DOCUMENT' },
    { label: /Transcriber|TRS/i, signature: '<Trans' },
    { label: /FLEx/i, signature: '<document' },
    { label: /Toolbox/i, signature: '\\tx export sample' },
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      (async () => {
        await page.locator('.left-rail-project-hub-btn').click();
        await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
        await page
          .locator('.context-menu-submenu-export')
          .getByRole('menuitem', { name: format.label })
          .click();
      })(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    expect(await readFile(path!, 'utf8')).toContain(format.signature);
    expect(await readProjectData(page)).toBe(before);
  }
  const formatDownloadCount = downloads.length;

  // Open the real export menu and cancel its first confirmation.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  await page
    .locator('.context-menu-submenu-export')
    .getByRole('menuitem', { name: /JYM/i })
    .click();
  await expect(page.locator('.context-menu-submenu-export')).toBeHidden();
  expect(downloads).toHaveLength(formatDownloadCount);
  expect(await readProjectData(page)).toBe(before);

  const acceptExport = (dialog: import('@playwright/test').Dialog) => {
    void (/password|密码/i.test(dialog.message()) ? dialog.dismiss() : dialog.accept());
  };
  page.on('dialog', acceptExport);
  const archive = await exportArchiveFromProjectHub(page, 'JYM');
  expect(unzipSync(new Uint8Array(archive))['META-INF/manifest.json']).toBeDefined();
  expect(downloads).toHaveLength(formatDownloadCount + 1);

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
  expect(downloads).toHaveLength(formatDownloadCount + 1);
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

  const malformedTextGrid = {
    name: 'broken.TextGrid',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a Praat TextGrid'),
  };
  await input.setInputFiles(malformedTextGrid);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /仅写入目标表示|Target representation only/i }).check();
  await dialog.getByRole('button', { name: /开始导入标注|Start annotation import/ }).click();
  await expect(page.getByText(/导入失败|Import failed/).first()).toBeVisible();
  await expect(dialog.getByText('broken.TextGrid')).toBeVisible();
  await expect(
    dialog.getByRole('radio', { name: /仅写入目标表示|Target representation only/i }),
  ).toBeChecked();
  expect(await readProjectData(page)).toBe(before);
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await waitForDexie(page);
  expect(await readProjectData(page)).toBe(before);

  const validTextGrid = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "textgrid import sample"
`;
  await input.setInputFiles({
    name: 'valid.TextGrid',
    mimeType: 'text/plain',
    buffer: Buffer.from(validTextGrid),
  });
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('annotation-import-as-new-document').check();
  const acceptImportConfirmation = (browserDialog: import('@playwright/test').Dialog) => {
    void browserDialog.accept();
  };
  page.on('dialog', acceptImportConfirmation);
  await dialog.getByRole('button', { name: /开始导入标注|Start annotation import/ }).click();
  const timelineMismatch = page.getByRole('dialog', {
    name: /Timeline length mismatch|时间轴长度不匹配/,
  });
  await expect(timelineMismatch).toBeVisible();
  await timelineMismatch
    .getByRole('checkbox', { name: /I understand and want to continue importing|我理解并继续导入/ })
    .check();
  await timelineMismatch.getByRole('button', { name: /^Import$/ }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(async () =>
          (await (globalThis as any).__jieyuDexie__.table('layer_unit_contents').toArray()).some(
            (row: { text?: string }) => row.text === 'textgrid import sample',
          ),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  page.off('dialog', acceptImportConfirmation);
  await expect(dialog).toBeHidden();
  const afterValidImport = await readProjectData(page);
  await page.reload();
  await waitForDexie(page);
  expect(await readProjectData(page)).toBe(afterValidImport);

  const additionalFormats = [
    {
      name: 'valid.eaf',
      mimeType: 'text/xml',
      text: '<?xml version="1.0"?><ANNOTATION_DOCUMENT AUTHOR="E2E" DATE="2026-01-01T00:00:00.000Z" FORMAT="3.0" VERSION="3.0"><HEADER MEDIA_FILE="" TIME_UNITS="milliseconds"/><TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/><TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="200"/></TIME_ORDER><TIER TIER_ID="transcription" LINGUISTIC_TYPE_REF="default-lt"><ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>eaf import sample</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION></TIER><LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false"/></ANNOTATION_DOCUMENT>',
      importedText: 'eaf import sample',
    },
    {
      name: 'valid.trs',
      mimeType: 'text/xml',
      text: '<?xml version="1.0"?><Trans><Speakers><Speaker id="spk1" name="Alice" /></Speakers><Episode><Section type="report" startTime="0" endTime="0.2"><Turn speaker="spk1" startTime="0" endTime="0.2"><Sync time="0"/>trs import sample</Turn></Section></Episode></Trans>',
      importedText: 'trs import sample',
    },
    {
      name: 'valid.flextext',
      mimeType: 'text/xml',
      text: '<?xml version="1.0"?><document version="2"><interlinear-text><paragraphs><paragraph><phrases><phrase guid="p1" begin-time-offset="0" end-time-offset="200"><item type="txt" lang="en">flextext import sample</item></phrase></phrases></paragraph></paragraphs></interlinear-text></document>',
      importedText: 'flextext import sample',
    },
    {
      name: 'valid.toolbox',
      mimeType: 'text/plain',
      text: '\\ref rec1\n\\ts 0.000\n\\te 0.200\n\\tx toolbox import sample\n',
      importedText: 'toolbox import sample',
    },
  ];
  for (const sample of additionalFormats) {
    await input.setInputFiles({
      name: sample.name,
      mimeType: sample.mimeType,
      buffer: Buffer.from(sample.text),
    });
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('annotation-import-as-new-document').check();
    await dialog.getByRole('button', { name: /开始导入标注|Start annotation import/ }).click();
    const mismatch = page.getByRole('dialog', { name: /Timeline length mismatch|时间轴长度不匹配/ });
    if (await mismatch.isVisible().catch(() => false)) {
      await mismatch
        .getByRole('checkbox', { name: /I understand and want to continue importing|我理解并继续导入/ })
        .check();
      await mismatch.getByRole('button', { name: /^Import$/ }).click();
    }
    await expect
      .poll(
        async () =>
          page.evaluate(async (text) =>
            (await (globalThis as any).__jieyuDexie__.table('layer_unit_contents').toArray()).some(
              (row: { text?: string }) => row.text === text,
            ), sample.importedText),
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(dialog).toBeHidden();
    const afterImport = await readProjectData(page);
    await page.reload();
    await waitForDexie(page);
    expect(await readProjectData(page)).toBe(afterImport);
  }
});
