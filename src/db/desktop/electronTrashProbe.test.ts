import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../../..');

describe('electron trash probe', () => {
  it.skipIf(process.platform !== 'darwin')(
    'moves a temp file to the trash with Electron',
    () => {
      const node = process.execPath;
      const vite = join(root, 'node_modules/vite/bin/vite.js');
      const built = spawnSync(node, [vite, 'build', '--config', 'electron/vite.trash.config.ts'], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(built.status, built.stderr).toBe(0);
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const ran = spawnSync(
        node,
        [join(root, 'node_modules/electron/cli.js'), 'electron/dist/trashProbe.js'],
        { cwd: root, encoding: 'utf8', env },
      );
      expect(ran.status, `${ran.stdout}\n${ran.stderr}`).toBe(0);
    },
    60_000,
  );
});
