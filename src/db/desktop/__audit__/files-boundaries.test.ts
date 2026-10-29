import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../openProject';
import { exportDesktopJyt, importDesktopJyt } from '../projectExchange';
import { importForeignFile } from '../foreignImport';
import { openDesktopSession, resetDesktopSessions } from '../projectSession';
import { callDesktopSession } from '../desktopCall';

it('does not allow exchange export to overwrite the open project database', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-audit-files-'));
  try {
    const { sessionId } = openDesktopSession(folder, [folder]);
    const file = join(folder, 'project.sqlite');
    const before = readFileSync(file).subarray(0, 16).toString();
    try {
      callDesktopSession(sessionId, 'exchange.exportJyt', { file });
    } catch {
      /* rejection is allowed */
    }
    expect(readFileSync(file).subarray(0, 16).toString()).toBe(before);
  } finally {
    resetDesktopSessions();
    rmSync(folder, { recursive: true, force: true });
  }
});

it('refuses a nonempty restore destination even without project.sqlite', () => {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-audit-files-'));
  try {
    const source = join(root, 'source');
    mkdirSync(source);
    const project = openProject(source);
    const bytes = exportDesktopJyt(project.db);
    project.close();
    const dest = join(root, 'dest');
    mkdirSync(dest);
    writeFileSync(join(dest, 'existing.txt'), 'keep');
    expect(() => importDesktopJyt(dest, bytes)).toThrow('import destination is not empty');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('does not publish imported sources through a symlink outside the project', () => {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-audit-files-'));
  try {
    const folder = join(root, 'project');
    mkdirSync(folder);
    openProject(folder).close();
    const outside = join(root, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(folder, 'sources'));
    const file = join(root, 'test.TextGrid');
    writeFileSync(
      file,
      `File type = "ooTextFile"\nObject class = "TextGrid"\nxmin = 0\nxmax = 1\ntiers? <exists>\nsize = 0\nitem []:\n`,
    );
    try {
      importForeignFile({ folder, file });
    } catch {
      /* rejection is allowed */
    }
    expect(readdirSync(outside)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
