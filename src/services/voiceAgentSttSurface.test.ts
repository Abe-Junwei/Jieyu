import { describe, expect, it, vi } from 'vitest';
import { applyVoiceSttInterimIfNotFinal } from './voiceAgentSttSurface';
import type { SttResult } from './VoiceInputService';

describe('applyVoiceSttInterimIfNotFinal', () => {
  it('returns false on final results', () => {
    const setInterim = vi.fn();
    expect(
      applyVoiceSttInterimIfNotFinal({
        result: { text: 'x', isFinal: true, confidence: 1 } as SttResult,
        setInterimText: setInterim,
        setConfidence: vi.fn(),
      }),
    ).toBe(false);
    expect(setInterim).not.toHaveBeenCalled();
  });

  it('clears error when interim text is non-empty and updates surface', () => {
    const clear = vi.fn();
    const setInterim = vi.fn();
    const setConf = vi.fn();
    expect(
      applyVoiceSttInterimIfNotFinal({
        result: { text: '  hi ', isFinal: false, confidence: 0.4 } as SttResult,
        clearErrorOnNonEmptyInterim: clear,
        setInterimText: setInterim,
        setConfidence: setConf,
      }),
    ).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(setInterim).toHaveBeenCalledWith('  hi ');
    expect(setConf).toHaveBeenCalledWith(0.4);
  });

  it('does not clear error when interim text is empty', () => {
    const clear = vi.fn();
    applyVoiceSttInterimIfNotFinal({
      result: { text: '   ', isFinal: false, confidence: 0.1 } as SttResult,
      clearErrorOnNonEmptyInterim: clear,
      setInterimText: vi.fn(),
      setConfidence: vi.fn(),
    });
    expect(clear).not.toHaveBeenCalled();
  });
});
