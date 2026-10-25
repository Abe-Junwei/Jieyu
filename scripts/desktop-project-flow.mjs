import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const scratch = mkdtempSync(path.join(tmpdir(), 'jieyu-m4c-run-'));
const outFile = path.join(scratch, 'folder.txt');
const port = 5199;
const devServer = `http://127.0.0.1:${port}/desktop-project`;
let vite;
let folder = '';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  return result.status ?? 1;
}

function rebuildNodeSqlite() {
  const npmExec = process.env.npm_execpath;
  return npmExec
    ? run(node, [npmExec, 'rebuild', 'better-sqlite3'])
    : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'better-sqlite3']);
}

let status = 0;
try {
  status = rebuildNodeSqlite();
  if (status === 0) {
    status = run(
      node,
      [
        path.join(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        'src/db/desktop/projectFlowSeed.test.ts',
        '--maxWorkers=1',
      ],
      { ...process.env, JIEYU_DESKTOP_FLOW_OUT: outFile },
    );
  }
  if (status === 0) folder = readFileSync(outFile, 'utf8').trim();
  if (status === 0) {
    status = run(node, [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'electron/vite.config.ts',
    ]);
  }
  if (status === 0) {
    status = run(node, [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'electron/vite.preload.config.ts',
    ]);
  }
  if (status === 0) {
    vite = spawn(
      node,
      [
        path.join(root, 'node_modules/vite/bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { cwd: root, stdio: 'inherit' },
    );
    await waitForDevServer();
    status = run(node, [
      path.join(root, 'node_modules/@electron/rebuild/lib/cli.js'),
      '-f',
      '-w',
      'better-sqlite3',
    ]);
  }
  if (status === 0) {
    const playwright = [
      path.join(root, 'node_modules/playwright/cli.js'),
      'test',
      '--config',
      'playwright.desktop-project.config.ts',
    ];
    const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
    const flowEnv = {
      ...process.env,
      JIEYU_DESKTOP_FLOW_FOLDER: folder,
      JIEYU_VITE_DEV_SERVER: devServer,
    };
    delete flowEnv.JIEYU_SQLITE_STORAGE_PORT;
    status = needsXvfb
      ? run('xvfb-run', ['-a', node, ...playwright], flowEnv)
      : run(node, playwright, flowEnv);
  }
} catch (error) {
  console.error(error);
  if (status === 0) status = 1;
} finally {
  if (vite && !vite.killed) vite.kill();
  rebuildNodeSqlite();
  if (folder.length > 0) rmSync(folder, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
process.exitCode = status;

async function waitForDevServer() {
  const deadline = Date.now() + 90_000;
  let last = 'not started';
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`vite exited ${vite.exitCode}`);
    try {
      const response = await fetch(devServer);
      if (response.ok) return;
      last = String(response.status);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`dev server did not answer: ${last}`);
}
