/**
 * WS8-X3：长项目里每个语段都要有一个波形 region（以前只有最后一个）。
 * WS8-X3: in a long project every segment gets its own waveform region (previously only the last one).
 */
import { test, expect, type Page } from '@playwright/test';

import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';
import { importMediaViaDialog, waitForDexie } from './_helpers/transcriptionProjectFlow';

const NOW = '2099-06-10T00:00:00.000Z';
const DURATION_SEC = 480;
const SEGMENT_COUNT = 80;

async function seedSegments(page: Page): Promise<string[]> {
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
      const ids: string[] = [];
      // 一个父 unit 覆盖全部语段：这正是以前只剩最后一个 region 的形态
      // One parent unit covering every segment: the shape that used to leave only the last region
      await dexie.layer_units.put({
        id: 'utt_ws8x3',
        textId: text.id,
        mediaId: media.id,
        startTime: 0,
        endTime: duration,
        createdAt,
        updatedAt: createdAt,
      });
      for (let i = 0; i < count; i += 1) {
        const id = `seg_ws8x3_${String(i).padStart(3, '0')}`;
        ids.push(id);
        await dexie.layer_units.put({
          id,
          textId: text.id,
          mediaId: media.id,
          layerId: layer.id,
          unitType: 'segment',
          parentUnitId: 'utt_ws8x3',
          rootUnitId: 'utt_ws8x3',
          startTime: i * step,
          endTime: i * step + step * 0.8,
          createdAt,
          updatedAt: createdAt,
          provenance: { actorType: 'human', method: 'manual', createdAt },
        });
      }
      return ids;
    },
    { createdAt: NOW, count: SEGMENT_COUNT, duration: DURATION_SEC },
  );
}

/** wavesurfer 在 shadow DOM 里渲染；按 part 收集 region id | wavesurfer renders in shadow DOM */
async function readWaveformRegionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ids = new Set<string>();
    const visit = (root: Document | ShadowRoot) => {
      root.querySelectorAll('[part]').forEach((el) => {
        const parts = (el.getAttribute('part') ?? '').split(/\s+/);
        if (parts[0] === 'region' && parts[1]?.startsWith('seg_ws8x3_')) ids.add(parts[1]);
      });
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) visit(el.shadowRoot);
      });
    };
    visit(document);
    return [...ids].sort();
  });
}

test.describe('WS8-X3 waveform regions', () => {
  test('a long project has one waveform region per segment', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    await importMediaViaDialog(page, {
      name: 'ws8x3-long.wav',
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
    const segmentIds = await seedSegments(page);
    const project = await page.evaluate(async () => {
      const dexie = (globalThis as unknown as { __jieyuDexie__: Record<string, any> })
        .__jieyuDexie__;
      const text = await dexie.texts.orderBy('updatedAt').reverse().first();
      const media = await dexie.media_items.where('textId').equals(text.id).first();
      localStorage.setItem('jieyu:waveform-display-mode', 'waveform');
      return { textId: text.id as string, mediaId: media.id as string };
    });
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });

    // 适配缩放下整段音频都在视口内，所以可见语段 = 全部语段 | at fit zoom every segment is in view
    await expect.poll(() => readWaveformRegionIds(page), { timeout: 30_000 }).toEqual(segmentIds);
  });
});
