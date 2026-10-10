/**
 * WS8-X1：长项目 Ctrl+滚轮放大后再滚动，不得出现 React #185（Maximum update depth exceeded）。
 * WS8-X1: Ctrl+wheel zoom on a long project then scroll must not throw React #185.
 */
import { test, expect, type Page } from '@playwright/test';

import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';
import { importMediaViaDialog, waitForDexie } from './_helpers/transcriptionProjectFlow';

const NOW = '2099-06-10T00:00:00.000Z';
const DURATION_SEC = 480;
const SEGMENT_COUNT = 80;

function isReact185(message: string): boolean {
  return /Minified React error #185|Maximum update depth exceeded/i.test(message);
}

async function seedSegments(page: Page): Promise<{ textId: string; mediaId: string }> {
  return page.evaluate(
    async ({ createdAt, count, duration }) => {
      const dexie = (globalThis as unknown as { __jieyuDexie__: Record<string, any> })
        .__jieyuDexie__;
      await dexie.open();
      const text = await dexie.texts.orderBy('updatedAt').reverse().first();
      const media = await dexie.media_items.where('textId').equals(text.id).first();
      const layer = (await dexie.tier_definitions.toArray()).find(
        (row: { textId: string; contentType: string }) =>
          row.textId === text.id && row.contentType === 'transcription',
      );
      const step = duration / count;
      await dexie.layer_units.put({
        id: 'utt_ws8x1',
        textId: text.id,
        mediaId: media.id,
        startTime: 0,
        endTime: duration,
        createdAt,
        updatedAt: createdAt,
      });
      for (let i = 0; i < count; i += 1) {
        const id = `seg_ws8x1_${String(i).padStart(3, '0')}`;
        await dexie.layer_units.put({
          id,
          textId: text.id,
          mediaId: media.id,
          layerId: layer.id,
          unitType: 'segment',
          parentUnitId: 'utt_ws8x1',
          rootUnitId: 'utt_ws8x1',
          startTime: i * step,
          endTime: i * step + step * 0.8,
          createdAt,
          updatedAt: createdAt,
          provenance: { actorType: 'human', method: 'manual', createdAt },
        });
      }
      return { textId: text.id as string, mediaId: media.id as string };
    },
    { createdAt: NOW, count: SEGMENT_COUNT, duration: DURATION_SEC },
  );
}

async function readWaveInfo(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('.transcription-wave-canvas');
    const sr = host
      ? [...host.querySelectorAll('*')].map((e) => e.shadowRoot).find(Boolean) ?? null
      : null;
    const scroll = sr?.querySelector('[part="scroll"]') as HTMLElement | null;
    const wrapper = sr?.querySelector('[part="wrapper"]') as HTMLElement | null;
    const regs = sr ? [...sr.querySelectorAll('[part~="region"]')] : [];
    return {
      regionCount: regs.length,
      scrollLeft: scroll?.scrollLeft ?? -1,
      clientWidth: scroll?.clientWidth ?? 0,
      wrapperWidth: wrapper?.scrollWidth ?? 0,
    };
  });
}

async function zoomIn(page: Page, times = 12) {
  const box = (await page.locator('.transcription-wave-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let k = 0; k < times; k += 1) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(120);
  }
  await page.keyboard.up('Control');
}

test.describe('WS8-X1 React #185 on zoom/scroll', () => {
  test('Ctrl+wheel zoom then scroll on 80-segment project yields zero #185 pageerrors', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 60_000,
    });
    await waitForDexie(page);
    await importMediaViaDialog(page, {
      name: 'ws8x1-long.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from(buildMinimalWavBytes(DURATION_SEC)),
    });
    await createTranscriptionAndTranslationLayersViaLeftRail(page, {
      transcription: {
        languageSearch: 'Chinese',
        optionName: /Chinese|中文|汉语|zho/i,
        iso6393: 'zho',
      },
      translation: { languageSearch: 'French', optionName: /French|法语|fra/i, iso6393: 'fra' },
    });
    const project = await seedSegments(page);
    await page.evaluate(() => localStorage.setItem('jieyu:waveform-display-mode', 'waveform'));
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 60_000,
    });

    await expect
      .poll(async () => (await readWaveInfo(page)).regionCount, { timeout: 60_000 })
      .toBeGreaterThan(0);
    const before = await readWaveInfo(page);

    await zoomIn(page);
    await expect
      .poll(async () => (await readWaveInfo(page)).wrapperWidth, { timeout: 20_000 })
      .toBeGreaterThan(Math.max(before.clientWidth, 1) * 2);
    await page.waitForTimeout(500);

    const zoomed = await readWaveInfo(page);
    await page.evaluate((left) => {
      const host = document.querySelector('.transcription-wave-canvas')!;
      const sr = [...host.querySelectorAll('*')].map((e) => e.shadowRoot).find(Boolean)!;
      const scroll = sr.querySelector('[part="scroll"]') as HTMLElement;
      scroll.scrollLeft = left;
    }, zoomed.wrapperWidth);
    await page.waitForTimeout(800);

    const box = (await page.locator('.transcription-wave-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let k = 0; k < 8; k += 1) {
      await page.mouse.wheel(-600, 0);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(500);

    const react185 = pageErrors.filter(isReact185);
    expect(
      react185,
      `expected 0 React #185 pageerrors, got ${react185.length}: ${react185.slice(0, 3).join(' | ')}`,
    ).toEqual([]);
  });
});
