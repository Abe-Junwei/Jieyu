import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDesktopSession, resetDesktopSessions } from '../db/desktop/projectSession';
import { afterEach, describe, expect, it } from 'vitest';
import {
  grantRestoredProject,
  readRestoredProjectGrant,
  resetRestoredProjectGrant,
} from './restoredProjectGrant';

afterEach(() => {
  resetDesktopSessions();
  resetRestoredProjectGrant();
});

describe('restored project grant', () => {
  it('returns only the folder granted for that session', () => {
    grantRestoredProject('session-a', '/tmp/restored');
    expect(readRestoredProjectGrant('session-a')).toBe('/tmp/restored');
    expect(() => readRestoredProjectGrant('session-b')).toThrow('restored project is not granted');
  });
});

it('expires a restore grant when another project opens', () => {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-restore-grant-'));
  const a = join(root, 'a');
  const b = join(root, 'b');
  mkdirSync(a);
  mkdirSync(b);
  try {
    const first = openDesktopSession(a, [a]);
    grantRestoredProject(first.sessionId, join(root, 'copy'));
    openDesktopSession(b, [b]);
    expect(() => readRestoredProjectGrant(first.sessionId)).toThrow(
      'restored project is not granted',
    );
  } finally {
    resetDesktopSessions();
    rmSync(root, { recursive: true, force: true });
  }
});
