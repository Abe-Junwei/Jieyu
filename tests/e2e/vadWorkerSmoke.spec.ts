import { test, expect } from '@playwright/test';

import { importMediaViaDialog, waitForDexie } from './_helpers/transcriptionProjectFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';

/**
 * VAD worker 冒烟：生产构建下 vadWorker 必须被 Vite 打包为 JS，导入音频后 Silero 实际运行（缓存引擎为 silero 而非 energy）。
 * VAD worker smoke: in the production build the vadWorker must be bundled as JavaScript (not shipped as raw .ts),
 * and importing audio must run Silero for real (cached engine `silero`, not the `energy` fallback).
 */
test.describe('VAD worker 冒烟 | VAD worker smoke', () => {
  test('Silero VAD worker 以 JS 加载并产出 silero 结果 | Silero VAD worker loads as JS and produces silero results', async ({
    page,
  }) => {
    const vadWorkerUrls: string[] = [];
    const workerErrors: string[] = [];
    // 与地图冒烟相同：用 worker 事件拿 URL 再主动请求 | Same as the map smoke: worker event URL, then fetch it
    page.on('worker', (worker) => {
      if (/\/vadWorker[^/]*$/.test(new URL(worker.url()).pathname))
        vadWorkerUrls.push(worker.url());
    });
    page.on('console', (message) => {
      if (/VAD Worker onerror|VAD runtime init failed/.test(message.text()))
        workerErrors.push(message.text());
    });

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    await importMediaViaDialog(page, {
      name: 'e2e-vad-sample.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from(buildMinimalWavBytes(2, 16_000)),
    });

    // 导入后自动预热 VAD 缓存 | Import auto-warms the VAD cache
    const readEngines = () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('jieyu:vad-cache');
        if (!raw) return [] as string[];
        const parsed = JSON.parse(raw) as { entries?: Record<string, { engine?: string }> };
        return Object.values(parsed.entries ?? {}).map((entry) => entry.engine ?? '');
      });
    await expect.poll(readEngines, { timeout: 60_000 }).not.toEqual([]);

    expect(await readEngines()).toEqual(['silero']);
    expect(vadWorkerUrls.length).toBeGreaterThan(0);
    const workerScript = await page.request.get(vadWorkerUrls[0]!);
    expect(workerScript.status()).toBe(200);
    expect(workerScript.headers()['content-type'] ?? '').toMatch(/javascript/);
    expect(workerErrors).toEqual([]);
  });
});
