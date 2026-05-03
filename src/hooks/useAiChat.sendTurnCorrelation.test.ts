// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isSendTurnCorrelationDebugEnabled,
  logSendTurnPhase,
} from './useAiChat.sendTurnCorrelation';

const DEBUG_LS_KEY = 'jieyu_debug_ai_send_turn';

describe('useAiChat.sendTurnCorrelation', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

  beforeEach(() => {
    infoSpy.mockClear();
    window.localStorage.removeItem(DEBUG_LS_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(DEBUG_LS_KEY);
  });

  it('reports debug disabled when localStorage flag is not 1', () => {
    window.localStorage.setItem(DEBUG_LS_KEY, '0');
    expect(isSendTurnCorrelationDebugEnabled()).toBe(false);
    logSendTurnPhase('snt-x', 'preflight_ok');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('reports debug enabled and logs when localStorage flag is 1', () => {
    window.localStorage.setItem(DEBUG_LS_KEY, '1');
    expect(isSendTurnCorrelationDebugEnabled()).toBe(true);
    logSendTurnPhase('snt-x', 'preflight_ok', { assistantId: 'a1' });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const firstCall = infoSpy.mock.calls[0];
    expect(firstCall?.[0]).toBe('[jieyu][ai-chat:send-turn]');
    expect(firstCall?.[1]).toEqual({
      correlationId: 'snt-x',
      phase: 'preflight_ok',
      detail: { assistantId: 'a1' },
    });
  });

  it('treats localStorage access errors as disabled', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(isSendTurnCorrelationDebugEnabled()).toBe(false);
    logSendTurnPhase('snt-x', 'finally');
    expect(infoSpy).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});
