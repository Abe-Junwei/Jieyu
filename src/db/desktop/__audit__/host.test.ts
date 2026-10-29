import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from '../projectSession';
import {
  bindDesktopMediaSession,
  grantDesktopMedia,
  resolveDesktopMedia,
  resetDesktopMediaGrants,
} from '../../../desktop/skeleton/desktopMediaGrant';
import { sliceForRange } from '../../../desktop/skeleton/mediaRange';
it('expired session media grants are refused after replacement open fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'audit-host-'));
  try {
    const first = join(root, 'first');
    const bad = join(root, 'bad');
    const session = openDesktopSession(first, [first, bad]);
    bindDesktopMediaSession(session.sessionId);
    const token = grantDesktopMedia(session.sessionId, join(first, 'audio.wav'));
    // An incompatible project makes replacement fail after closing the current project.
    mkdirSync(bad);
    writeFileSync(join(bad, 'project.sqlite'), 'invalid');
    expect(() => openDesktopSession(bad, [first, bad])).toThrow();
    expect(() => requireDesktopSession(session.sessionId)).toThrow('project session expired');
    expect(resolveDesktopMedia(token)).toBeNull();
  } finally {
    resetDesktopSessions();
    resetDesktopMediaGrants();
    rmSync(root, { recursive: true, force: true });
  }
});
it('a suffix larger than the recording returns the complete recording', () => {
  expect(sliceForRange(10, 'bytes=-20')).toEqual({ status: 206, start: 0, end: 9 });
});
