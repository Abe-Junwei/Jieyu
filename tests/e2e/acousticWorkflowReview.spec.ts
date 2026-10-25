import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { buildMinimalWavBytes } from './_helpers/minimalWav';
import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import {
  importMediaViaDialog,
  readSegmentText,
  seedThreeSegmentsOnCurrentProject,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`acoustic selection exports preserve scope and localized failures (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.addInitScript((value) => localStorage.setItem('jieyu.locale', value), locale);
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
    await waitForDexie(page);
    const wav = buildMinimalWavBytes(4, 16000);
    const samples = new DataView(wav.buffer);
    for (let i = 0; i < 4 * 16000; i += 1) {
      samples.setInt16(
        44 + i * 2,
        Math.round(12000 * Math.sin((2 * Math.PI * 220 * i) / 16000)),
        true,
      );
    }
    await importMediaViaDialog(page, {
      name: 'acoustic-review.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from(wav),
    });
    await createTranscriptionAndTranslationLayersViaLeftRail(page, {
      transcription: {
        languageSearch: 'Chinese',
        optionName: /Chinese|中文|汉语|zho/i,
        iso6393: 'zho',
      },
      translation: { languageSearch: 'French', optionName: /French|法语|fra/i, iso6393: 'fra' },
    });
    const project = await seedThreeSegmentsOnCurrentProject(page);
    await page.goto(
      `/transcription?textId=${project.textId}&mediaId=${project.mediaId}&unitId=seg_e2e_a&unitKind=segment`,
    );
    await expect(
      page.locator('.app-side-pane-segment-list-item-btn').filter({ hasText: 'alpha' }),
    ).toBeVisible();
    await page.getByTestId('transcription-acoustic-inspector-toggle').click();
    const panel = page.getByTestId('transcription-acoustic-inspector');
    await expect(panel).toBeVisible();
    const jsonLabel = /^(导出 JSON|Export JSON)$/;
    const exportJson = panel.getByRole('button', { name: jsonLabel });
    await expect(panel.locator('.transcription-analysis-acoustic-overview-section')).toContainText(
      '0.00-1.00s',
    );
    await expect(exportJson).toBeEnabled({ timeout: 60_000 });

    const downloadText = async (name: RegExp) => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        panel.getByRole('button', { name, exact: true }).click(),
      ]);
      return readFile((await download.path())!, 'utf8');
    };
    const selection = JSON.parse(await downloadText(jsonLabel));
    expect(selection.selectionStartSec).toBe(0);
    expect(selection.selectionEndSec).toBe(1);
    expect(selection.frames.length).toBe(selection.sampleCount);
    expect(selection.sampleCount).toBeGreaterThan(0);
    expect(
      selection.frames.every(
        (frame: { timeSec: number }) => frame.timeSec >= 0 && frame.timeSec <= 1,
      ),
    ).toBe(true);
    expect(
      selection.frames.some(
        (frame: { f0Hz: number | null }) => frame.f0Hz !== null && Math.abs(frame.f0Hz - 220) < 10,
      ),
    ).toBe(true);
    await panel.getByRole('button', { name: /^(整段媒体|Full media)$/ }).click();
    const fullMedia = JSON.parse(await downloadText(jsonLabel));
    expect(fullMedia.selectionStartSec).toBe(0);
    expect(fullMedia.selectionEndSec).toBe(4);
    expect(fullMedia.sampleCount).toBeGreaterThan(selection.sampleCount);
    await panel.getByRole('button', { name: /^(当前选区|Current selection)$/ }).click();
    for (const { name, signature } of [
      { name: /^(导出 CSV|Export CSV)$/, signature: 'timeSec,relativeTimeSec,timeRatio,f0Hz' },
      { name: /^(导出 PitchTier|Export PitchTier)$/, signature: 'PitchTier' },
      { name: /^(导出研究 JSON|Export Research JSON)$/, signature: 'jieyu-acoustic-export' },
    ]) {
      expect(await downloadText(name)).toContain(signature);
    }
    await page.screenshot({ path: info.outputPath('acoustic-selection.png') });

    await page.evaluate(() => {
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) throw new Error('isolated-acoustic-download-failure');
        originalClick.call(this);
      };
    });
    await exportJson.click();
    await expect(panel.getByRole('status')).toContainText(
      `${locale === 'zh-CN' ? '导出失败' : 'Export failed'}: isolated-acoustic-download-failure`,
    );
    await expect(exportJson).toBeEnabled();
    await page.reload();
    await waitForDexie(page);
    expect(await readSegmentText(page, 'seg_e2e_a', project.layerId)).toBe('alpha');
  });
}
