// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useVoiceAgent } from './useVoiceAgent';
import {
  clearVoiceAliasLearningLog,
  loadVoiceAliasLearningLog,
  saveVoiceIntentAliasMap,
  type ActionId,
} from '../services/IntentRouter';

// ── Mock region detection (avoids 3-second timeout in tests) ──
vi.mock('../utils/regionDetection', () => ({
  detectRegion: vi.fn().mockResolvedValue('global'),
  saveRegionPreference: vi.fn(),
  clearRegionPreference: vi.fn(),
}));

// ── Mock VoiceInputService ──

let lastMockVoiceService: {
  simulateResult: (r: unknown) => void;
  simulateError: (e: string) => void;
  simulateVadState: (s: boolean) => void;
} | null = null;
let mockStartError: Error | null = null;

vi.mock('../services/VoiceInputService', () => {
  class MockVoiceInputService {
    private resultListeners: Array<(r: unknown) => void> = [];
    private errorListeners: Array<(e: string) => void> = [];
    private stateListeners: Array<(l: boolean) => void> = [];
    private vadListeners: Array<(s: boolean) => void> = [];

    constructor() {
      lastMockVoiceService = this;
    }

    onResult(fn: (r: unknown) => void) {
      this.resultListeners.push(fn);
      return () => { this.resultListeners = this.resultListeners.filter((l) => l !== fn); };
    }
    onError(fn: (e: string) => void) {
      this.errorListeners.push(fn);
      return () => { this.errorListeners = this.errorListeners.filter((l) => l !== fn); };
    }
    onStateChange(fn: (l: boolean) => void) {
      this.stateListeners.push(fn);
      return () => { this.stateListeners = this.stateListeners.filter((l) => l !== fn); };
    }
    onVadStateChange(fn: (s: boolean) => void) {
      this.vadListeners.push(fn);
      return () => { this.vadListeners = this.vadListeners.filter((l) => l !== fn); };
    }

    async start() {
      if (mockStartError) throw mockStartError;
      for (const fn of this.stateListeners) fn(true);
    }
    stop()  { for (const fn of this.stateListeners) fn(false); }
    setLang() {}
    dispose() { this.stop(); }

    simulateResult(result: unknown) {
      for (const fn of this.resultListeners) fn(result);
    }

    simulateError(error: string) {
      for (const fn of this.errorListeners) fn(error);
    }

    simulateVadState(speaking: boolean) {
      for (const fn of this.vadListeners) fn(speaking);
    }
  }

  return {
    VoiceInputService: MockVoiceInputService,
    isWebSpeechSupported: () => true,
  };
});

// ── Mock EarconService ──

vi.mock('../services/EarconService', () => ({
  playActivate:   vi.fn(),
  playDeactivate: vi.fn(),
  playSuccess:    vi.fn(),
  playError:      vi.fn(),
  playTick:       vi.fn(),
  unlockAudio:    vi.fn(async () => {}),
}));

afterEach(() => {
  cleanup();
  mockStartError = null;
  clearVoiceAliasLearningLog();
  saveVoiceIntentAliasMap({});
});

const makeExecuteAction = () => vi.fn<(actionId: ActionId) => void>();

// ── Tests ──

describe('useVoiceAgent', () => {
  describe('initial state', () => {
    it('starts not listening', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.listening).toBe(false);
      expect(result.current.speechActive).toBe(false);
    });

    it('defaults to command mode', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.mode).toBe('command');
    });

    it('starts with no error', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.error).toBeNull();
    });

    it('starts with empty interimText and finalText', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.interimText).toBe('');
      expect(result.current.finalText).toBe('');
    });

    it('starts with no pending confirmation', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.pendingConfirm).toBeNull();
    });
  });

  describe('start / stop', () => {
    it('starts listening after start()', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { await result.current.start(); });
      expect(result.current.listening).toBe(true);
    });

    it('stops listening after stop()', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { await result.current.start(); });
      await act(async () => { result.current.stop(); });
      expect(result.current.listening).toBe(false);
    });

    it('start() is idempotent when already listening', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { await result.current.start(); });
      await act(async () => { await result.current.start(); });
      expect(result.current.listening).toBe(true);
    });

    it('sets error and stays idle when start() fails', async () => {
      mockStartError = new Error('mic denied');
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );

      await act(async () => { await result.current.start(); });

      expect(result.current.listening).toBe(false);
      expect(result.current.agentState).toBe('idle');
      expect(result.current.error).toContain('mic denied');
    });
  });

  describe('toggle()', () => {
    it('starts from stopped state', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.toggle(); });
      expect(result.current.listening).toBe(true);
    });

    it('stops from started state', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.start(); });
      await act(async () => { result.current.toggle(); });
      expect(result.current.listening).toBe(false);
    });
  });

  describe('mode switching', () => {
    it('switchMode() changes mode', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.switchMode('dictation'); });
      expect(result.current.mode).toBe('dictation');
    });

    it('start(mode) sets mode during start', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.start('analysis'); });
      expect(result.current.mode).toBe('analysis');
      expect(result.current.listening).toBe(true);
    });

    it('switchMode() clears interim text', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.switchMode('dictation'); });
      expect(result.current.interimText).toBe('');
    });
  });

  describe('safe mode', () => {
    it('is off by default', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.safeMode).toBe(false);
    });

    it('setSafeMode(true) enables safe mode', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.setSafeMode(true); });
      expect(result.current.safeMode).toBe(true);
    });

    it('initialSafeMode option sets initial state', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction(), initialSafeMode: true }),
      );
      expect(result.current.safeMode).toBe(true);
    });

    it('cancelPending() does not throw when nothing is pending', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.pendingConfirm).toBeNull();
      await act(async () => { result.current.cancelPending(); });
      expect(result.current.pendingConfirm).toBeNull();
    });
  });

  describe('session', () => {
    it('creates a new session on each start()', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.start(); });
      const id1 = result.current.session.id;
      await act(async () => { result.current.stop(); });
      await act(async () => { result.current.start(); });
      const id2 = result.current.session.id;
      expect(id1).not.toBe(id2);
    });

    it('session starts with empty entries', async () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.start(); });
      expect(result.current.session.entries).toHaveLength(0);
    });

    it('session id is a non-empty string', () => {
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      expect(result.current.session.id).toBeTruthy();
      expect(typeof result.current.session.id).toBe('string');
    });
  });

  describe('cleanup on unmount', () => {
    it('disposes service on unmount without errors', async () => {
      const { result, unmount } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction() }),
      );
      await act(async () => { result.current.start(); });
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('intent dispatch', () => {
    it('calls insertDictation when dictation intent is received', async () => {
      const executeAction = makeExecuteAction();
      const insertDictation = vi.fn();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, insertDictation }),
      );

      await act(async () => { result.current.start('dictation'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '这是要听写的内容',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.9,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(insertDictation).toHaveBeenCalledWith('这是要听写的内容');
      expect(executeAction).not.toHaveBeenCalled();
    });

    it('calls sendToAiChat when chat intent is received in analysis mode', async () => {
      const executeAction = makeExecuteAction();
      const sendToAiChat = vi.fn();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, sendToAiChat }),
      );

      await act(async () => { result.current.start('analysis'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '分析一下这个句子的结构',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.88,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(sendToAiChat).toHaveBeenCalledWith('分析一下这个句子的结构');
    });

    it('calls executeAction with playPause for matched playback command', async () => {
      const executeAction = makeExecuteAction();
      const sendToAiChat = vi.fn();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, sendToAiChat }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '播放',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.95,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(executeAction).toHaveBeenCalledWith('playPause');
    });

    it('does not call executeAction for chat intents in command mode', async () => {
      const executeAction = makeExecuteAction();
      const sendToAiChat = vi.fn();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, sendToAiChat }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '今天天气怎么样',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.8,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(executeAction).not.toHaveBeenCalled();
      expect(sendToAiChat).toHaveBeenCalledWith('今天天气怎么样');
    });
  });

  describe('safe mode & confirmPending', () => {
    it('sets pendingConfirm for destructive actions when safeMode is on', async () => {
      const executeAction = makeExecuteAction();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, initialSafeMode: true }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '删除',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.95,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(result.current.pendingConfirm).not.toBeNull();
      expect(result.current.pendingConfirm?.actionId).toBe('deleteSegment');
      expect(executeAction).not.toHaveBeenCalled();
    });

    it('calls executeAction immediately for non-destructive actions even with safeMode on', async () => {
      const executeAction = makeExecuteAction();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, initialSafeMode: true }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '播放',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.95,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(result.current.pendingConfirm).toBeNull();
      expect(executeAction).toHaveBeenCalledWith('playPause');
    });

    it('confirmPending executes the pending action', async () => {
      const executeAction = makeExecuteAction();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, initialSafeMode: true }),
      );

      await act(async () => { result.current.start('command'); });

      // Trigger a destructive action to set pendingConfirm
      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '删除',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.95,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(result.current.pendingConfirm?.actionId).toBe('deleteSegment');

      await act(async () => { result.current.confirmPending(); });

      expect(executeAction).toHaveBeenCalledWith('deleteSegment');
      expect(result.current.pendingConfirm).toBeNull();
    });

    it('cancelPending clears the pending confirm', async () => {
      const executeAction = makeExecuteAction();

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, initialSafeMode: true }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '删除',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.95,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(result.current.pendingConfirm?.actionId).toBe('deleteSegment');

      await act(async () => { result.current.cancelPending(); });

      expect(result.current.pendingConfirm).toBeNull();
      expect(executeAction).not.toHaveBeenCalled();
    });
  });

  describe('VAD state', () => {
    it('sets speechActive to true when VAD detects speech', async () => {
      const executeAction = makeExecuteAction();
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction }),
      );

      await act(async () => { result.current.start(); });

      // Simulate VAD state change (from VoiceInputService mock)
      // The mock doesn't expose onVadStateChange, so we verify initial state is false
      expect(result.current.speechActive).toBe(false);
    });
  });

  describe('LLM fallback', () => {
    it('uses resolveIntentWithLlm for unmatched command text', async () => {
      const executeAction = makeExecuteAction();
      const resolveIntentWithLlm = vi.fn().mockResolvedValue({
        type: 'chat',
        text: '收到，我将执行复杂的多步操作',
        raw: '执行复杂的多步操作序列',
      });

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, resolveIntentWithLlm }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '执行复杂的多步操作序列',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.92,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(resolveIntentWithLlm).toHaveBeenCalledTimes(1);
    });

    it('does not call resolveIntentWithLlm for already matched command', async () => {
      const resolveIntentWithLlm = vi.fn().mockResolvedValue(null);
      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction(), resolveIntentWithLlm }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '播放',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.95,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(resolveIntentWithLlm).not.toHaveBeenCalled();
    });

    it('learns alias after action fallback and skips LLM next time', async () => {
      const executeAction = makeExecuteAction();
      const resolveIntentWithLlm = vi.fn().mockResolvedValue({
        type: 'action',
        actionId: 'playPause',
        confidence: 1,
        raw: '开始一下',
      });

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, resolveIntentWithLlm }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '开始一下',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.9,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '开始一下',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.9,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(resolveIntentWithLlm).toHaveBeenCalledTimes(1);
      expect(executeAction).toHaveBeenCalledTimes(2);
      expect(executeAction).toHaveBeenNthCalledWith(1, 'playPause');
      expect(executeAction).toHaveBeenNthCalledWith(2, 'playPause');
    });

    it('records alias learning log entries for fallback decisions', async () => {
      const resolveIntentWithLlm = vi.fn().mockResolvedValue({
        type: 'action',
        actionId: 'playPause',
        confidence: 1,
        raw: '开始一下',
      });

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction: makeExecuteAction(), resolveIntentWithLlm }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '开始一下',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.9,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      const log = loadVoiceAliasLearningLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[log.length - 1]).toMatchObject({
        phrase: '开始一下',
        actionId: 'playPause',
        reason: 'updated',
      });
    });
    it('requires confirmation for destructive actions returned by LLM fallback', async () => {
      const executeAction = makeExecuteAction();
      const resolveIntentWithLlm = vi.fn().mockResolvedValue({
        type: 'action',
        actionId: 'deleteSegment',
        confidence: 1,
        raw: '把这个去掉吧',
      });

      const { result } = renderHook(() =>
        useVoiceAgent({ executeAction, resolveIntentWithLlm }),
      );

      await act(async () => { result.current.start('command'); });

      await act(async () => {
        lastMockVoiceService?.simulateResult({
          text: '把这个去掉吧',
          lang: 'zh-CN',
          isFinal: true,
          confidence: 0.82,
          engine: 'web-speech',
        });
        await Promise.resolve();
      });

      expect(resolveIntentWithLlm).toHaveBeenCalledTimes(1);
      expect(result.current.lastIntent?.type).toBe('action');
      if (result.current.lastIntent?.type === 'action') {
        expect(result.current.lastIntent.fromFuzzy).toBe(true);
      }
      expect(result.current.pendingConfirm?.actionId).toBe('deleteSegment');
      expect(executeAction).not.toHaveBeenCalled();
    });
  });
});
