import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
