import { test, expect } from '@playwright/test';

import { importMediaViaDialog, waitForDexie } from './_helpers/transcriptionProjectFlow';
import { buildMinimalWavFile } from './_helpers/minimalWav';

/**
 * BF1-N1 冒烟：生产构建（vite preview）下 maplibre-gl 6 的 worker 必须以 JS 形式加载，地图触发 load。
 * BF1-N1 smoke: in the production build (vite preview) the maplibre-gl 6 worker must load as JavaScript
 * and the map must fire `load`. OSM tiles are answered locally (no network); CSP is enforced before routing, so a
 * fulfilled tile proves the app CSP allows the tile host.
 */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.describe('语言地图冒烟 | Language map smoke', () => {
  test('maplibre worker 加载且地图触发 load | maplibre worker loads and the map fires load', async ({
    page,
  }) => {
    const workerUrls: string[] = [];
    const errors: string[] = [];
    const cspViolations: string[] = [];
    let tilesServed = 0;
    await page.route('https://tile.openstreetmap.org/**', (route) => {
      tilesServed += 1;
      return route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG });
    });
    // 用 worker 事件拿 URL 再主动请求：response 事件偶发收不到 worker 脚本（BF2-4）
    // Take the URL from the worker event and fetch it: the response event occasionally misses the worker script (BF2-4)
    page.on('worker', (worker) => {
      if (/maplibre-gl-worker[^/]*\.mjs/.test(worker.url())) workerUrls.push(worker.url());
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && /worker/i.test(message.text())) errors.push(message.text());
      if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
    });
    page.on('pageerror', (error) => {
      if (/worker/i.test(error.message)) errors.push(error.message);
    });

    // 语言元数据页需要当前项目：导入一段音频即可建项目 | The metadata page needs a project: importing audio creates one
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    await importMediaViaDialog(page, buildMinimalWavFile());

    await page.goto('/assets/language-metadata?languageId=cmn');
    const selectProject = page.getByRole('button', { name: /Select project|选择项目/ });
    await expect
      .poll(
        async () =>
          (await selectProject.count()) > 0 ||
          (await page.locator('input[placeholder="-90 ~ 90"]').count()) > 0,
        {
          timeout: 25_000,
        },
      )
      .toBe(true);
    if (await selectProject.count()) await selectProject.first().click();

    const latitude = page.locator('input[placeholder="-90 ~ 90"]').first();
    await expect(latitude).toBeVisible({ timeout: 20_000 });
    await latitude.fill('39.9042');
    await page.locator('input[placeholder="-180 ~ 180"]').first().fill('116.4074');

    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-map-loaded="true"]').first()).toBeAttached({
      timeout: 30_000,
    });

    expect(workerUrls.length).toBeGreaterThan(0);
    const workerScript = await page.request.get(workerUrls[0]!);
    expect(workerScript.status()).toBe(200);
    expect(workerScript.headers()['content-type'] ?? '').toMatch(/javascript/);
    expect(errors).toEqual([]);
    await expect.poll(() => tilesServed, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(cspViolations).toEqual([]);
  });
});
