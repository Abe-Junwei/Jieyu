import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  return result.status ?? 1;
}

const node = process.execPath;
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const mainBuild = run(node, [vite, 'build', '--config', 'electron/vite.config.ts']);
if (mainBuild !== 0) process.exit(mainBuild);
const preloadBuild = run(node, [vite, 'build', '--config', 'electron/vite.preload.config.ts']);
if (preloadBuild !== 0) process.exit(preloadBuild);
const rebuilt = run(node, [path.join(root, 'node_modules/@electron/rebuild/lib/cli.js'), '-f', '-w', 'better-sqlite3']);
const electronArgs = [path.join(root, 'node_modules/electron/cli.js')];
if (process.platform === 'linux') {
  electronArgs.push('--password-store=basic', '--no-sandbox');
}
electronArgs.push('electron/dist/main.js', '--smoke');
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const smokeEnv = { ...process.env, JIEYU_SQLITE_STORAGE_PORT: '1' };
const smoke = rebuilt === 0
  ? needsXvfb
    ? run('xvfb-run', ['-a', node, ...electronArgs], smokeEnv)
    : run(node, electronArgs, smokeEnv)
  : rebuilt;
const npmExec = process.env.npm_execpath;
const restored = npmExec
  ? run(node, [npmExec, 'rebuild', 'better-sqlite3'])
  : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'better-sqlite3']);
process.exit(smoke === 0 ? restored : smoke);
