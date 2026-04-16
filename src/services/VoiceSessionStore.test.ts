// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSession } from './IntentRouter';
import { clearAllVoiceSessions, deleteVoiceSession, loadRecentVoiceSessions, saveVoiceSession } from './VoiceSessionStore';

function makeSession(id: string, startedAt: number): VoiceSession {
  return {
    id,
    startedAt,
    mode: 'command',
    entries: [
      {
        timestamp: startedAt,
        sttText: `unit-${id}`,
        confidence: 0.9,
        intent: {
          type: 'chat',
          raw: `unit-${id}`,
          text: `unit-${id}`,
        },
      },
    ],
  };
}

describe('VoiceSessionStore', () => {
  beforeEach(async () => {
    await clearAllVoiceSessions();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists sessions and loads the newest ones first', async () => {
    await saveVoiceSession(makeSession('session-1', 100));
    await saveVoiceSession(makeSession('session-2', 200));
    await saveVoiceSession(makeSession('session-3', 300));

    const recent = await loadRecentVoiceSessions(2);

    expect(recent.map((item) => item.id)).toEqual(['session-3', 'session-2']);
  });

  it('prunes old sessions beyond the retention limit', async () => {
    for (let index = 0; index < 22; index += 1) {
      await saveVoiceSession(makeSession(`session-${index + 1}`, index + 1));
    }

    const retained = await loadRecentVoiceSessions(30);

    expect(retained).toHaveLength(20);
    expect(retained[0]?.id).toBe('session-22');
    expect(retained[retained.length - 1]?.id).toBe('session-3');
  });

  it('deletes a specific session by id', async () => {
    await saveVoiceSession(makeSession('session-1', 100));
    await saveVoiceSession(makeSession('session-2', 200));

    await deleteVoiceSession('session-1');

    const retained = await loadRecentVoiceSessions(10);
    expect(retained.map((item) => item.id)).toEqual(['session-2']);
  });

  it('degrades safely when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);

    await expect(saveVoiceSession(makeSession('session-1', 100))).resolves.toBeUndefined();
    await expect(deleteVoiceSession('session-1')).resolves.toBeUndefined();
    await expect(clearAllVoiceSessions()).resolves.toBeUndefined();
    await expect(loadRecentVoiceSessions(5)).resolves.toEqual([]);
  });
});