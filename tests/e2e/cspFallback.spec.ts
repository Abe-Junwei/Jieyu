/**
 * PF2-1：模板取不到时的兜底 CSP 与模板一样放行本地能力（blob worker、wasm、blob 音频、data 图片、blob fetch），
 * 并且同样锁住 base-uri；应用照常启动。
 * PF2-1: when the template cannot be imported, the fallback CSP allows the same local capabilities
 * as the template (blob worker, wasm, blob audio, data image, blob fetch), still locks base-uri,
 * and the app boots.
 */
import { expect, test } from '@playwright/test';

for (const mode of ['template', 'fallback'] as const) {
  test(`csp ${mode}: app boots and local capabilities work`, async ({ page }) => {
    if (mode === 'fallback') {
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        const body = (await response.text()).replace('id="jieyu-csp"', 'id="jieyu-csp-gone"');
        return route.fulfill({ response, body });
      });
    }
    await page.goto('/');
    await expect(page.locator('#root > *').first()).toBeAttached({ timeout: 15_000 });

    const out = await page.evaluate(async () => {
      const settle = (run: (ok: (v: string) => void) => void) =>
        new Promise<string>((ok) => {
          setTimeout(() => ok('timeout'), 3000);
          try {
            run(ok);
          } catch {
            ok('blocked');
          }
        });
      const template = document.getElementById('jieyu-csp') !== null;
      const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length;
      const wasm = await settle((ok) => {
        WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])).then(
          () => ok('ok'),
          () => ok('blocked'),
        );
      });
      const blobWorker = await settle((ok) => {
        const src = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
        const worker = new Worker(src);
        worker.onmessage = () => ok('ok');
        worker.onerror = () => ok('error');
      });
      // 0.1 s 16-bit PCM WAV of silence
      const n = 1600;
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const w = (o: number, s: string) =>
        [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF');
      v.setUint32(4, 36 + n * 2, true);
      w(8, 'WAVEfmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, 16000, true);
      v.setUint32(28, 32000, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      w(36, 'data');
      v.setUint32(40, n * 2, true);
      const blobAudio = await settle((ok) => {
        const audio = new Audio();
        audio.onloadedmetadata = () => ok('ok');
        audio.onerror = () => ok('error');
        audio.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      });
      const dataImg = await settle((ok) => {
        const img = new Image();
        img.onload = () => ok('ok');
        img.onerror = () => ok('error');
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      });
      const blobFetch = await settle((ok) => {
        fetch(URL.createObjectURL(new Blob(['x']))).then(
          () => ok('ok'),
          () => ok('blocked'),
        );
      });
      const base = document.createElement('base');
      base.href = 'https://evil.example/';
      document.head.appendChild(base);
      const baseOrigin = new URL('x', document.baseURI).origin;
      base.remove();
      return {
        template,
        metas,
        wasm,
        blobWorker,
        blobAudio,
        dataImg,
        blobFetch,
        baseLocked: baseOrigin === location.origin,
      };
    });

    expect(out).toEqual({
      template: mode === 'template',
      metas: 1,
      wasm: 'ok',
      blobWorker: 'ok',
      blobAudio: 'ok',
      dataImg: 'ok',
      blobFetch: 'ok',
      baseLocked: true,
    });
  });
}
