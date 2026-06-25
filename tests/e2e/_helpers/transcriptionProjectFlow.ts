import { expect, type Page } from '@playwright/test';

import { createTranscriptionAndTranslationLayersViaLeftRail } from './layerCreationFlow';
import { buildMinimalWavFile } from './minimalWav';

const NOW = '2099-06-10T00:00:00.000Z';

export async function waitForDexie(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } }).__jieyuDexie__),
    { timeout: 25_000 },
  );
}

export async function importMediaViaDialog(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const directInput = page.locator('input.transcription-media-file-input');
  await directInput.setInputFiles(file);

  await expect.poll(async () => {
    return page.evaluate(async () => {
      const dexie = (globalThis as unknown as {
        __jieyuDexie__: { open: () => Promise<unknown>; media_items: { count: () => Promise<number> } };
      }).__jieyuDexie__;
      if (!dexie) return 0;
      await dexie.open();
      return dexie.media_items.count();
    });
  }).toBeGreaterThan(0);
}

export async function seedThreeSegmentsOnCurrentProject(page: Page): Promise<{
  textId: string;
  mediaId: string;
  layerId: string;
}> {
  return page.evaluate(async (createdAt) => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__: {
        open: () => Promise<unknown>;
        texts: { orderBy: (k: string) => { reverse: () => { first: () => Promise<{ id: string } | undefined> } } };
        media_items: { where: (k: string) => { equals: (v: string) => { first: () => Promise<{ id: string } | undefined> } } };
        tier_definitions: { toArray: () => Promise<Array<{ id: string; textId: string; contentType: string }>> };
        layer_units: { put: (row: Record<string, unknown>) => Promise<string> };
        layer_unit_contents: { put: (row: Record<string, unknown>) => Promise<string> };
      };
    }).__jieyuDexie__;
    await dexie.open();

    const text = await dexie.texts.orderBy('updatedAt').reverse().first();
    if (!text?.id) throw new Error('no text after media import');
    const media = await dexie.media_items.where('textId').equals(text.id).first();
    if (!media?.id) throw new Error('no media after import');
    const tierRows = await dexie.tier_definitions.toArray();
    const layerRow = tierRows.find(
      (row) => row.textId === text.id && row.contentType === 'transcription',
    );
    if (!layerRow?.id) throw new Error('no transcription layer');
    const layer = layerRow;

    const uttId = 'utt_e2e_field';
    await dexie.layer_units.put({
      id: uttId,
      textId: text.id,
      mediaId: media.id,
      startTime: 0,
      endTime: 3,
      createdAt,
      updatedAt: createdAt,
    });

    const segments = [
      { id: 'seg_e2e_a', start: 0, end: 1, text: 'alpha' },
      { id: 'seg_e2e_b', start: 1, end: 2, text: 'beta' },
      { id: 'seg_e2e_c', start: 2, end: 3, text: 'gamma' },
    ];

    for (const seg of segments) {
      await dexie.layer_units.put({
        id: seg.id,
        textId: text.id,
        mediaId: media.id,
        layerId: layer.id,
        unitType: 'segment',
        parentUnitId: uttId,
        rootUnitId: uttId,
        startTime: seg.start,
        endTime: seg.end,
        createdAt,
        updatedAt: createdAt,
        provenance: { actorType: 'human', method: 'manual', createdAt },
      });
      await dexie.layer_unit_contents.put({
        id: `cnt_${seg.id}`,
        textId: text.id,
        unitId: seg.id,
        layerId: layer.id,
        contentRole: 'primary_text',
        modality: 'text',
        text: seg.text,
        sourceType: 'human',
        createdAt,
        updatedAt: createdAt,
        provenance: { actorType: 'human', method: 'manual', createdAt },
      });
    }

    return { textId: text.id, mediaId: media.id, layerId: layer.id };
  }, NOW);
}

export async function setupFieldProjectWithMediaAndSegments(page: Page): Promise<{
  textId: string;
  mediaId: string;
  layerId: string;
}> {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);

  await importMediaViaDialog(page, buildMinimalWavFile());

  await createTranscriptionAndTranslationLayersViaLeftRail(page, {
    transcription: {
      languageSearch: 'Chinese',
      optionName: /Chinese|中文|汉语|zho/i,
      iso6393: 'zho',
    },
    translation: {
      languageSearch: 'French',
      optionName: /French|法语|fra/i,
      iso6393: 'fra',
    },
  });

  return seedThreeSegmentsOnCurrentProject(page);
}

export function acceptArchiveExportDialogs(page: Page): void {
  let step = 0;
  page.on('dialog', (dialog) => {
    step += 1;
    if (step === 1) {
      void dialog.accept();
      return;
    }
    void dialog.dismiss();
  });
}

export async function exportJymArchive(page: Page): Promise<Buffer> {
  acceptArchiveExportDialogs(page);

  await page.locator('.left-rail-project-hub-btn').click();
  const exportMenuEntry = page.getByRole('menuitem', { name: /导出|Export/ });
  await exportMenuEntry.hover();
  const jymEntry = page.locator('.context-menu-submenu-export').getByRole('menuitem', { name: /JYM/i });
  await expect(jymEntry).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await jymEntry.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('JYM download stream missing');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function importJymArchive(page: Page, archive: Buffer): Promise<void> {
  await waitForDexie(page);
  const archiveInput = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym"]');
  await archiveInput.setInputFiles({
    name: 'roundtrip.jym',
    mimeType: 'application/octet-stream',
    buffer: archive,
  });

  const importDialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
  await expect(importDialog).toBeVisible({ timeout: 15_000 });
  await page.getByRole('radio', { name: /Replace all records|replace-all|全部替换/i }).click();
  await page.getByRole('button', { name: /Start project import|开始导入项目/i }).click();
  await expect(importDialog).toBeHidden({ timeout: 60_000 });
}

export async function readSegmentText(page: Page, segmentId: string, layerId: string): Promise<string | null> {
  return page.evaluate(
    async ({ segmentId: unitId, layerId: lid }) => {
      const dexie = (globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          layer_unit_contents: {
            where: (k: string) => {
              equals: (v: string) => { toArray: () => Promise<Array<{ layerId?: string; text?: string }>> };
            };
          };
        };
      }).__jieyuDexie__;
      await dexie.open();
      const rows = await dexie.layer_unit_contents.where('unitId').equals(unitId).toArray();
      const row = rows.find((item) => item.layerId === lid);
      return row?.text ?? null;
    },
    { segmentId, layerId },
  );
}
