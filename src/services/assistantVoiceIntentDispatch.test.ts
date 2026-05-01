import { describe, expect, it } from 'vitest';
import { appendTurnToVoiceSession } from './assistantVoiceIntentDispatch';
import type { VoiceSession } from './IntentRouter';
import type { SttResult } from './VoiceInputService';

function makeSession(): VoiceSession {
  return {
    id: 's1',
    startedAt: 1,
    entries: [],
    mode: 'command',
  };
}

describe('appendTurnToVoiceSession', () => {
  it('appends one entry with intent and STT metadata', () => {
    const stt: SttResult = {
      text: '播放',
      lang: 'zh-CN',
      confidence: 0.9,
      isFinal: true,
      engine: 'web-speech',
    };
    const intent = { type: 'action' as const, actionId: 'playPause' as const, raw: '播放', confidence: 0.9 };
    const base = makeSession();
    const next = appendTurnToVoiceSession(base, intent, stt);

    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]?.intent).toEqual(intent);
    expect(next.entries[0]?.sttText).toBe('播放');
    expect(next.entries[0]?.confidence).toBe(0.9);
    expect(next.id).toBe(base.id);
    expect(base.entries).toHaveLength(0);
  });
});
