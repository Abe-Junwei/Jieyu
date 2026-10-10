/**
 * WS8-X2：声学 PCM 超限时不得出现 AcousticAnalysisPayloadTooLargeError 的 pageerror / unhandledrejection。
 * WS8-X2: oversize acoustic PCM must not surface PayloadTooLarge as pageerror or unhandledrejection.
 */
import { readFileSync, existsSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { importMediaViaDialog, waitForDexie } from './_helpers/transcriptionProjectFlow';

const LONG_AUDIO = process.env.WS8_AUDIO ?? '/workspace/jieyu-review/ws8-media/long-speech-8m.mp3';

function isPayloadNoise(text: string): boolean {
  return /AcousticAnalysisPayloadTooLargeError|payload exceeds limit/i.test(text);
}

async function installRejectionProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __jieyuPayloadRej__?: string[] };
    w.__jieyuPayloadRej__ = [];
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason;
      const text =
        reason instanceof Error ? `${reason.name}:${reason.message}` : String(reason ?? '');
      w.__jieyuPayloadRej__?.push(text);
    });
  });
}

async function readPayloadRejections(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __jieyuPayloadRej__?: string[] };
    return (w.__jieyuPayloadRej__ ?? []).filter((t) =>
      /AcousticAnalysisPayloadTooLargeError|payload exceeds limit/i.test(t),
    );
  });
}

test.describe('WS8-X2 acoustic oversize soft-skip', () => {
  test('chromium: forced oversize analyzeAudioBuffer yields skip and zero payload rejections', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'forced API path is chromium-focused');
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await installRejectionProbe(page);

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 60_000,
    });
    await waitForDexie(page);
    // AcousticAnalysisService.getInstance (via AI acoustic runtime) installs the e2e hook.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Boolean(
              (window as unknown as { __jieyuAcousticAnalysisService__?: unknown })
                .__jieyuAcousticAnalysisService__,
            ),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);

    const outcome = await page.evaluate(async () => {
      const S = (
        window as unknown as {
          __jieyuAcousticAnalysisService__: {
            getInstance: () => {
              analyzeAudioBuffer: (input: {
                mediaKey: string;
                audioBuffer: {
                  length: number;
                  numberOfChannels: number;
                  sampleRate: number;
                  duration: number;
                  getChannelData: () => Float32Array;
                };
              }) => Promise<{ skippedReason?: string; frames: unknown[] }>;
            };
          };
        }
      ).__jieyuAcousticAnalysisService__;
      const svc = S.getInstance();
      const oversizedLength = Math.floor((64 * 1024 * 1024) / 4) + 8;
      const result = await svc.analyzeAudioBuffer({
        mediaKey: 'e2e-forced-oversize',
        audioBuffer: {
          length: oversizedLength,
          numberOfChannels: 1,
          sampleRate: 16000,
          duration: oversizedLength / 16000,
          getChannelData: () => {
            throw new Error('downmix should not run for oversized buffers');
          },
        },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      return {
        skippedReason: result.skippedReason ?? null,
        frameCount: result.frames.length,
      };
    });

    const payloadPageErrors = pageErrors.filter(isPayloadNoise);
    const payloadRej = await readPayloadRejections(page);
    expect(outcome.skippedReason).toBe('payload_too_large');
    expect(outcome.frameCount).toBe(0);
    expect(payloadPageErrors).toEqual([]);
    expect(payloadRej).toEqual([]);
  });

  test('firefox: long audio paints waveform with zero payload pageerror/unhandledrejection', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'firefox', 'long-media oversize path targets Firefox');
    test.skip(!existsSync(LONG_AUDIO), `missing ${LONG_AUDIO}`);
    test.setTimeout(300_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await installRejectionProbe(page);

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 60_000,
    });
    await waitForDexie(page);
    await importMediaViaDialog(page, {
      name: LONG_AUDIO.split('/').pop()!,
      mimeType: 'audio/mpeg',
      buffer: readFileSync(LONG_AUDIO),
    });
    await createTranscriptionAndTranslationLayersViaLeftRail(page, {
      transcription: {
        languageSearch: 'Chinese',
        optionName: /Chinese|中文|汉语|zho/i,
        iso6393: 'zho',
      },
      translation: { languageSearch: 'French', optionName: /French|法语|fra/i, iso6393: 'fra' },
    });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const host = document.querySelector('.transcription-wave-canvas');
            const sr = host
              ? [...host.querySelectorAll('*')].map((e) => e.shadowRoot).find(Boolean)
              : null;
            const canv = sr ? [...sr.querySelectorAll('canvas')] : [];
            return canv.some((c) => c.width > 0 && c.height > 0);
          }),
        { timeout: 180_000 },
      )
      .toBe(true);

    await page.waitForTimeout(2000);
    const bodyHasFailed = await page.evaluate(() =>
      /Analysis failed|分析失败/i.test(document.body.innerText),
    );
    const payloadPageErrors = pageErrors.filter(isPayloadNoise);
    const payloadRej = await readPayloadRejections(page);
    expect(bodyHasFailed).toBe(false);
    expect(payloadPageErrors).toEqual([]);
    expect(payloadRej).toEqual([]);
  });
});
