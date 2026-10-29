import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { zipSync, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { assertZipBounded } from '../zipBounds';
import { openDesktopSession, resetDesktopSessions } from '../projectSession';
import { callDesktopSession } from '../desktopCall';
import { openProject } from '../openProject';
import { exportDesktopJym, importDesktopJym } from '../projectExchange';
import { importForeignFile } from '../foreignImport';

it('protects a registered recording from export overwrite', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-fix-export-'));
  try {
    const { sessionId } = openDesktopSession(folder, [folder]);
    const file = join(folder, 'a.wav');
    const bytes = Buffer.from('recording');
    writeFileSync(file, bytes);
    callDesktopSession(sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      duration: 1,
    });
    expect(() => callDesktopSession(sessionId, 'exchange.exportJyt', { file })).toThrow(
      'export target is the open project',
    );
    expect(readFileSync(file)).toEqual(bytes);
  } finally {
    resetDesktopSessions();
    rmSync(folder, { recursive: true, force: true });
  }
});

it('protects the database when the project was opened through a symlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-fix-alias-'));
  const folder = join(root, 'real');
  mkdirSync(folder);
  const alias = join(root, 'alias');
  symlinkSync(folder, alias);
  try {
    const { sessionId } = openDesktopSession(alias, [alias]);
    const file = join(folder, 'project.sqlite');
    const header = readFileSync(file).subarray(0, 16).toString();
    expect(() => callDesktopSession(sessionId, 'exchange.exportJyt', { file })).toThrow(
      'export target is the open project',
    );
    expect(readFileSync(file).subarray(0, 16).toString()).toBe(header);
  } finally {
    resetDesktopSessions();
    rmSync(root, { recursive: true, force: true });
  }
});

it('rejects a zip whose central size bypasses the local-header bound', () => {
  const bytes = zipSync({ huge: new Uint8Array(64 * 1024 * 1024 + 1) });
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(22, 0, true);
  expect(unzipSync(bytes).huge!.length).toBeGreaterThan(64 * 1024 * 1024);
  expect(() => assertZipBounded(bytes)).toThrow('desktop package is unreadable');
});

it('backs up a LIFT source referenced by lexeme provenance', () => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
    JSDOM: new (html: string) => { window: { DOMParser: typeof DOMParser } };
  };
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-fix-lift-'));
  const restored = mkdtempSync(join(tmpdir(), 'jieyu-fix-restored-'));
  const project = openProject(folder);
  try {
    const file = join(folder, 'sample.lift');
    writeFileSync(
      file,
      '<lift version="0.13"><entry id="e1"><lexical-unit><form lang="und"><text>word</text></form></lexical-unit><sense id="s1"><definition><form lang="und"><text>meaning</text></form></definition></sense></entry></lift>',
    );
    expect(importForeignFile({ folder, file, db: project.db }).written).toBe(1);
    const row = project.db
      .prepare('SELECT provenance_json FROM lexemes WHERE provenance_json IS NOT NULL')
      .get() as { provenance_json: string };
    const relpath = (JSON.parse(row.provenance_json) as { relpath: string }).relpath;
    importDesktopJym(restored, exportDesktopJym(project.db, folder));
    expect(existsFile(join(restored, relpath))).toBe(true);
  } finally {
    project.close();
    rmSync(folder, { recursive: true, force: true });
    rmSync(restored, { recursive: true, force: true });
  }
});

function existsFile(file: string): boolean {
  try {
    return readFileSync(file).byteLength > 0;
  } catch {
    return false;
  }
}
