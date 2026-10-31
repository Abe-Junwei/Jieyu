import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const folder = process.env.JIEYU_DESKTOP_FLOW_FOLDER;
const dev = process.env.JIEYU_VITE_DEV_SERVER;
test('mock model HTTP response becomes candidates, persists accepted text, and records failure/cancel/restart', async () => {
  test.skip(
    process.env.JIEYU_PACKAGED_APP !== undefined ||
      process.env.VITE_DESKTOP_MODEL_CANDIDATES_ENABLED !== 'true',
    'test:e2e:desktop-project enables the default-off development feature',
  );
  if (!folder || !dev) throw new Error('desktop flow fixture is missing');
  const root = mkdtempSync(join(tmpdir(), 'jieyu-model-e2e-'));
  const copy = join(root, 'project');
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let mode: 'ok' | 'empty' | 'error' | 'hold' = 'ok';
  let arrived!: () => void;
  let arrivedPromise = Promise.resolve();
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.end(
        JSON.stringify({
          jieyu: '1',
          status: 'ok',
          model: { id: 'org.example.mock', version: '1' },
        }),
      );
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'Content-Type': req.headers['content-type']! },
      }).formData();
      const request = JSON.parse(String(form.get('request')));
      const audio = form.get('audio');
      if (!(audio instanceof Blob)) throw new Error('missing audio');
      const wav = Buffer.from(await audio.arrayBuffer());
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.readUInt32LE(40)).toBe(8000);
      if (mode === 'hold') {
        arrived();
        return;
      }
      if (mode === 'error') {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            jieyu: '1',
            requestId: request.requestId,
            status: 'error',
            error: { code: 'bad_audio', message: 'synthetic error' },
          }),
        );
        return;
      }
      res.end(
        JSON.stringify({
          jieyu: '1',
          requestId: request.requestId,
          status: 'ok',
          model: { id: 'org.example.mock', version: '1' },
          result: {
            segments:
              mode === 'empty'
                ? []
                : [
                    {
                      start: 0,
                      end: 0.5,
                      text: `model candidate ${request.requestId.endsWith('-0') ? 'one' : 'two'}`,
                    },
                  ],
          },
        }),
      );
    } catch {
      res.statusCode = 400;
      res.end('{}');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port');
  const declaration = join(root, 'jieyu-model.json');
  writeFileSync(
    declaration,
    JSON.stringify({
      id: 'org.example.mock',
      name: 'Mock',
      version: '1',
      minJieyuProtocol: '1',
      license: 'MIT',
      capabilities: { transcribe: { wordTimestamps: false, maxAudioSec: 0.5 } },
      audio: { accept: [{ format: 'wav-pcm16', sampleRate: 8000, channels: 1 }] },
      transport: {
        kind: 'http',
        baseUrl: `http://127.0.0.1:${address.port}`,
        timeoutSecPerChunk: 5,
      },
    }),
  );
  let app: ElectronApplication | undefined;
  const launch = async () => {
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      JIEYU_DESKTOP_USER_DATA: join(root, 'userData'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const current = await electron.launch({ args: [resolve('electron/dist/main.js')], env });
    await current.evaluate((main, path) => {
      (
        main as unknown as {
          dialog: { showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }> };
        }
      ).dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, copy);
    const page = await current.firstWindow();
    await page.getByRole('button', { name: /^(Open folder|打开文件夹)$/ }).click();
    return { current, page };
  };
  try {
    let opened = await launch();
    app = opened.current;
    const page = opened.page;
    await app.evaluate((main, path) => {
      (
        main as unknown as {
          dialog: { showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }> };
        }
      ).dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, declaration);
    await page.getByRole('button', { name: /^(Choose model declaration|选择模型声明)$/ }).click();
    await page
      .getByRole('spinbutton', { name: /^(Recording start \(seconds\)|录音起点（秒）)$/ })
      .fill('1');
    await page
      .getByRole('spinbutton', { name: /^(Recording end \(seconds\)|录音终点（秒）)$/ })
      .fill('2');
    const run = page.getByRole('button', {
      name: /^(Generate transcript candidates|生成转写候选)$/,
    });
    await run.click();
    await expect(
      page.getByRole('textbox', { name: /^(Candidate transcript|候选正文) 0:0$/ }),
    ).toHaveValue('model candidate one');
    await page
      .getByRole('button', { name: /^(Accept transcript|采纳转写)$/ })
      .first()
      .click();
    await expect(
      page.getByRole('textbox', { name: /^(Candidate transcript|候选正文) 0:0$/ }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: /^(Accept transcript|采纳转写)$/ }).click();
    await expect(
      page.getByText(/^(Candidates accepted and saved|候选已采纳并保存)$/),
    ).toBeVisible();
    mode = 'empty';
    await run.click();
    await expect(
      page.getByText(/^(This run produced no candidates|本次运行没有生成候选)$/),
    ).toBeVisible();
    mode = 'error';
    await run.click();
    await expect(
      page.getByRole('alert').filter({ hasText: /This operation did not finish|这次操作未完成/ }),
    ).toBeVisible();
    mode = 'hold';
    arrivedPromise = new Promise<void>((r) => (arrived = r));
    await run.click();
    await arrivedPromise;
    await page.getByRole('button', { name: /^(Cancel transcription|取消转写)$/ }).click();
    await expect(
      page.getByText(/^(This transcription was cancelled|本次转写已取消)$/),
    ).toBeVisible();
    arrivedPromise = new Promise<void>((r) => (arrived = r));
    await run.click();
    await arrivedPromise;
    await app.close();
    app = undefined;
    opened = await launch();
    app = opened.current;
    await expect(
      opened.page.getByRole('button', { name: '1.0–1.5 model candidate one' }),
    ).toBeVisible();
    await app.close();
    app = undefined;
    const db = new Database(join(copy, 'project.sqlite'), { readonly: true });
    try {
      expect(db.prepare('SELECT status FROM model_runs ORDER BY started_at').all()).toEqual([
        { status: 'ok' },
        { status: 'ok' },
        { status: 'error' },
        { status: 'cancelled' },
        { status: 'interrupted' },
      ]);
      const row = db
        .prepare('SELECT provenance_json FROM unit_texts WHERE body=?')
        .get('model candidate one') as { provenance_json: string };
      expect(JSON.parse(row.provenance_json)).toMatchObject({
        actorType: 'ai',
        reviewStatus: 'confirmed',
      });
    } finally {
      db.close();
    }
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  }
});
