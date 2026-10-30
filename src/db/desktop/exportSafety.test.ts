import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

it('refuses a database hard link for every export without changing the database', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-export-identity-'));
  try {
    const { sessionId } = openDesktopSession(folder, [folder]);
    const database = join(folder, 'project.sqlite');
    const before = readFileSync(database);
    const target = join(folder, 'alias.jyt');
    linkSync(database, target);
    for (const method of [
      'exchange.exportJyt',
      'exchange.exportJym',
      'exchange.exportManuscript',
    ]) {
      expect(() =>
        callDesktopSession(sessionId, method, {
          file: target,
          ...(method === 'exchange.exportManuscript' ? { manuscriptId: 'unused' } : {}),
        }),
      ).toThrow('export target is the open project');
      expect(readFileSync(database).equals(before)).toBe(true);
    }
    rmSync(target);
    callDesktopSession(sessionId, 'reopen', {});
    expect(callDesktopSession(sessionId, 'project.get', {})).not.toBeNull();
  } finally {
    resetDesktopSessions();
    rmSync(folder, { recursive: true, force: true });
  }
});

it('protects retained sources and attachment objects, including their hard links', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-export-assets-'));
  try {
    const { sessionId } = openDesktopSession(folder, [folder]);
    for (const directory of ['sources', 'attachments/objects']) {
      mkdirSync(join(folder, directory), { recursive: true });
      const original = join(folder, directory, 'retained');
      writeFileSync(original, 'original bytes');
      const alias = join(folder, `${directory.replaceAll('/', '-')}.jyt`);
      linkSync(original, alias);
      for (const file of [original, alias]) {
        expect(() => callDesktopSession(sessionId, 'exchange.exportJyt', { file })).toThrow(
          'export target is the open project',
        );
        expect(readFileSync(original, 'utf8')).toBe('original bytes');
      }
    }
    const allowed = join(folder, 'export.jyt');
    expect(callDesktopSession(sessionId, 'exchange.exportJyt', { file: allowed })).toEqual({
      file: allowed,
    });
    expect(readFileSync(allowed).subarray(0, 2).toString()).toBe('PK');
  } finally {
    resetDesktopSessions();
    rmSync(folder, { recursive: true, force: true });
  }
});

it('does not change the open database when an export names that file', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-export-database-'));
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

it('protects a registered recording from export overwrite', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-export-recording-'));
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
  const root = mkdtempSync(join(tmpdir(), 'jieyu-export-alias-'));
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
