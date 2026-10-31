import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { cpSync, copyFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { pcmWav } from '../../src/desktop/transcriptionAudio.js';

test('local Whisper weights produce real candidates, accepted text and provenance after Electron restart', async () => {
  const model = process.env.JIEYU_WHISPER_REAL_MODEL,
    audio = process.env.JIEYU_WHISPER_SYNTHETIC_AUDIO;
  test.skip(
    !model || !audio || !process.env.WHISPER_CLI || process.env.JIEYU_PACKAGED_APP !== undefined,
    'explicit synthetic speech + verified local weights + development engine required',
  );
  const folder = process.env.JIEYU_DESKTOP_FLOW_FOLDER;
  if (!folder || !model || !audio) throw new Error('synthetic fixture missing');
  const root = mkdtempSync(join(tmpdir(), 'jieyu-real-whisper-e2e-')),
    copy = join(root, 'project');
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  copyFileSync(audio, join(copy, 'clip.wav'));
  const bytes = readFileSync(audio),
    duration = pcmWav(bytes).duration;
  const db = new Database(join(copy, 'project.sqlite'));
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare("UPDATE media SET sha256=?,duration=? WHERE relpath='clip.wav'").run(
    createHash('sha256').update(bytes).digest('hex'),
    duration,
  );
  db.close();
  let app: ElectronApplication | undefined;
  const launch = async () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    env.JIEYU_DESKTOP_USER_DATA = join(root, 'userData');
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
    await page.getByRole('button', { name: 'Clip', exact: true }).click();
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
    }, model);
    await page
      .getByRole('button', { name: /^(Choose local Whisper weights|选择本机 Whisper 权重)$/ })
      .click();
    await expect(page.getByText(/app\.jieyu\.whisper\.tiny/)).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole('spinbutton', { name: /^(Recording start \(seconds\)|录音起点（秒）)$/ })
      .fill('1');
    await page
      .getByRole('button', { name: /^(Generate transcript candidates|生成转写候选)$/ })
      .click();
    const candidates = page.getByRole('textbox', { name: /^(Candidate transcript|候选正文)/ });
    await expect(candidates.first()).toBeVisible({ timeout: 120_000 });
    const expected: string[] = [];
    while (await candidates.count()) {
      const count = await candidates.count();
      expected.push(await candidates.first().inputValue());
      await page
        .getByRole('button', { name: /^(Accept transcript|采纳转写)$/ })
        .first()
        .click();
      await expect(candidates).toHaveCount(count - 1);
    }
    expect(expected.length).toBeGreaterThan(0);
    await expect(
      page.getByText(/^(Candidates accepted and saved|候选已采纳并保存)$/),
    ).toBeVisible();
    await app.close();
    app = undefined;
    opened = await launch();
    app = opened.current;
    await expect(
      opened.page.getByRole('button').filter({ hasText: expected[0]! }).first(),
    ).toBeVisible();
    await app.close();
    app = undefined;
    const check = new Database(join(copy, 'project.sqlite'), { readonly: true });
    try {
      expect(
        check
          .prepare(
            'SELECT status,accepted_count AS accepted,pending_count AS pending FROM model_runs',
          )
          .all(),
      ).toEqual([{ status: 'ok', accepted: expected.length, pending: 0 }]);
      for (const text of expected) {
        const row = check
          .prepare('SELECT provenance_json FROM unit_texts WHERE body=?')
          .get(text) as { provenance_json: string };
        expect(JSON.parse(row.provenance_json)).toMatchObject({
          actorType: 'ai',
          reviewStatus: 'confirmed',
        });
      }
    } finally {
      check.close();
    }
  } finally {
    await app?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
