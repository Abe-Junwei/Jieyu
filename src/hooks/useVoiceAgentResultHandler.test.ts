// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { tf } from '../i18n';
import type { SttResult } from '../services/VoiceInputService';
import type { VoiceIntent, VoiceSession, ActionId } from '../services/IntentRouter';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockRouteIntent,
  mockLearnVoiceIntentAlias,
  mockBumpAliasUsage,
  mockRefineLlmFallbackIntent,
  mockIsDestructiveAction,
  mockShouldConfirmFuzzyAction,
  mockGetActionLabel,
  mockCollectAlternativeIntents,
  mockPlayTick,
  mockPlaySuccess,
  mockPlayError,
  mockMarkSessionStart,
  mockRecordAction,
  mockResolveVoiceIntent,
} = vi.hoisted(() => ({
  mockRouteIntent: vi.fn(),
  mockLearnVoiceIntentAlias: vi.fn(() => ({ applied: false, aliasMap: {} })),
  mockBumpAliasUsage: vi.fn(),
  mockRefineLlmFallbackIntent: vi.fn((i: VoiceIntent) => i),
  mockIsDestructiveAction: vi.fn(() => false),
  mockShouldConfirmFuzzyAction: vi.fn(() => false),
  mockGetActionLabel: vi.fn(() => 'Test Action'),
  mockCollectAlternativeIntents: vi.fn(() => []),
  mockPlayTick: vi.fn(),
  mockPlaySuccess: vi.fn(),
  mockPlayError: vi.fn(),
  mockMarkSessionStart: vi.fn(),
  mockRecordAction: vi.fn(),
  mockResolveVoiceIntent: vi.fn(),
}));

vi.mock('../services/voiceIntentResolution', () => ({
  resolveVoiceIntent: mockResolveVoiceIntent,
}));

vi.mock('./useVoiceAgent.runtime', () => ({
  loadIntentRouterRuntime: vi.fn(async () => ({
    routeIntent: mockRouteIntent,
    learnVoiceIntentAlias: mockLearnVoiceIntentAlias,
    bumpAliasUsage: mockBumpAliasUsage,
    isDestructiveAction: mockIsDestructiveAction,
    shouldConfirmFuzzyAction: mockShouldConfirmFuzzyAction,
    collectAlternativeIntents: mockCollectAlternativeIntents,
    LOW_CONFIDENCE_THRESHOLD: 0.4,
  })),
  loadVoiceIntentRefineRuntime: vi.fn(async () => ({
    refineLlmFallbackIntent: mockRefineLlmFallbackIntent,
  })),
}));

vi.mock('../services/EarconService', () => ({
  playTick: mockPlayTick,
  playSuccess: mockPlaySuccess,
  playError: mockPlayError,
}));

vi.mock('../services/voiceIntentUi', () => ({
  getActionLabel: mockGetActionLabel,
}));

vi.mock('../services/GlobalContextService', () => ({
  globalContext: { markSessionStart: mockMarkSessionStart },
}));

vi.mock('../services/UserBehaviorStore', () => ({
  userBehaviorStore: { recordAction: mockRecordAction },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSession(): VoiceSession {
  return { id: 'sess-1', startedAt: 1, entries: [], mode: 'command' };
}

function makeFinalResult(text: string): SttResult {
  return { text, lang: 'zh-CN', isFinal: true, confidence: 0.9, engine: 'web-speech' };
}

function makeRefLike<T>(value: T) {
  return { current: value };
}

function makeDefaultOptions(overrides: Record<string, unknown> = {}) {
  const executeAction = vi.fn();
  const sendToAiChat = vi.fn();
  const insertDictation = vi.fn();
  return {
    locale: 'zh-CN' as const,
    handlePipelineResult: vi.fn(() => false),
    modeRef: makeRefLike<'command' | 'dictation' | 'analysis'>('command'),
    safeModeRef: makeRefLike(false),
    sessionRef: makeRefLike(makeSession()),
    executeActionRef: makeRefLike(executeAction),
    sendToAiChatRef: makeRefLike(sendToAiChat),
    insertDictationRef: makeRefLike(insertDictation),
    resolveIntentWithLlmRef: makeRefLike(undefined as ((input: {
      text: string;
      mode: 'command' | 'dictation' | 'analysis';
      session: VoiceSession;
    }) => Promise<VoiceIntent | null>) | undefined),
    aliasMapRef: makeRefLike<Record<string, ActionId>>({}),
    queueAiThinking: vi.fn(),
    setDetectedLang: vi.fn(),
    setError: vi.fn(),
    setInterimText: vi.fn(),
    setFinalText: vi.fn(),
    setConfidence: vi.fn(),
    setAgentState: vi.fn(),
    setLastIntent: vi.fn(),
    setDisambiguationOptions: vi.fn(),
    setSession: vi.fn(),
    setPendingConfirm: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useVoiceAgentResultHandler', () => {
  // 动态 import 被测模块以确保 mock 先注册
  // Dynamic import to ensure mocks are registered first
  async function importHandler() {
    return import('./useVoiceAgentResultHandler');
  }

  it('routes action intent and executes action', async () => {
    const actionIntent: VoiceIntent = {
      type: 'action',
      actionId: 'play' as ActionId,
      raw: '播放',
      confidence: 0.95,
    };
    mockResolveVoiceIntent.mockResolvedValue({
      intent: actionIntent,
      llmFallbackFailed: false,
      llmResolvedAction: false,
      nextAliasMap: undefined,
      errorMessage: null,
    });

    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('播放'));
    });

    expect(mockResolveVoiceIntent).toHaveBeenCalledTimes(1);
    expect(opts.executeActionRef.current).toHaveBeenCalledWith('play');
    expect(opts.setAgentState).toHaveBeenCalledWith('routing');
    expect(mockPlaySuccess).toHaveBeenCalledTimes(1);
  });

  it('routes dictation intent and inserts text', async () => {
    const dictationIntent: VoiceIntent = {
      type: 'dictation',
      text: '你好世界',
      raw: '你好世界',
    };
    mockResolveVoiceIntent.mockResolvedValue({
      intent: dictationIntent,
      llmFallbackFailed: false,
      llmResolvedAction: false,
      nextAliasMap: undefined,
      errorMessage: null,
    });

    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('你好世界'));
    });

    expect(opts.insertDictationRef.current).toHaveBeenCalledWith('你好世界');
    expect(opts.setAgentState).toHaveBeenCalledWith('idle');
  });

  it('routes tool intent to AI chat as command', async () => {
    const toolIntent: VoiceIntent = {
      type: 'tool',
      toolName: 'search_units',
      params: { query: 'test' },
      raw: '搜索 test',
    };
    mockResolveVoiceIntent.mockResolvedValue({
      intent: toolIntent,
      llmFallbackFailed: false,
      llmResolvedAction: false,
      nextAliasMap: undefined,
      errorMessage: null,
    });

    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('搜索 test'));
    });

    expect(opts.sendToAiChatRef.current).toHaveBeenCalledWith(
      tf('zh-CN', 'transcription.voice.chatPrefix.command', { text: '搜索 test' }),
    );
    expect(opts.queueAiThinking).toHaveBeenCalledTimes(1);
    expect(mockPlaySuccess).toHaveBeenCalledTimes(1);
  });

  it('passes error message from shared resolver to setError', async () => {
    const chatIntent: VoiceIntent = {
      type: 'chat',
      text: '帮我处理这里',
      raw: '帮我处理这里',
    };
    mockResolveVoiceIntent.mockResolvedValue({
      intent: chatIntent,
      llmFallbackFailed: true,
      llmResolvedAction: false,
      nextAliasMap: undefined,
      errorMessage: '无法识别命令',
    });

    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('帮我处理这里'));
    });

    expect(opts.setError).toHaveBeenCalledWith('无法识别命令');
    expect(opts.setAgentState).toHaveBeenCalledWith('idle');
  });

  it('updates alias map when resolver returns nextAliasMap', async () => {
    const actionIntent: VoiceIntent = {
      type: 'action',
      actionId: 'stop' as ActionId,
      raw: '停下来',
      confidence: 0.8,
      fromFuzzy: true,
    };
    const newAliasMap = { '停下来': 'stop' as ActionId };
    mockResolveVoiceIntent.mockResolvedValue({
      intent: actionIntent,
      llmFallbackFailed: false,
      llmResolvedAction: true,
      nextAliasMap: newAliasMap,
      errorMessage: null,
    });

    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('停下来'));
    });

    expect(opts.aliasMapRef.current).toBe(newAliasMap);
  });

  it('appends session entry on final result', async () => {
    const intent: VoiceIntent = {
      type: 'action',
      actionId: 'play' as ActionId,
      raw: '播放',
      confidence: 0.9,
    };
    mockResolveVoiceIntent.mockResolvedValue({
      intent,
      llmFallbackFailed: false,
      llmResolvedAction: false,
      nextAliasMap: undefined,
      errorMessage: null,
    });

    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('播放'));
    });

    expect(opts.setSession).toHaveBeenCalledTimes(1);
    // setSession receives updater function
    const updater = (opts.setSession as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    if (typeof updater === 'function') {
      const prev = makeSession();
      const next = updater(prev);
      expect(next.entries).toHaveLength(1);
      expect(next.entries[0].intent).toBe(intent);
      expect(next.entries[0].sttText).toBe('播放');
    }
  });

  it('skips intent resolution for non-final results', async () => {
    const opts = makeDefaultOptions();
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    const interimResult: SttResult = {
      text: '正在说',
      lang: 'zh-CN',
      isFinal: false,
      confidence: 0.7,
      engine: 'web-speech',
    };
    await act(async () => {
      await result.current(interimResult);
    });

    expect(mockResolveVoiceIntent).not.toHaveBeenCalled();
    expect(opts.setInterimText).toHaveBeenCalledWith('正在说');
  });

  it('shows pending confirmation for fuzzy destructive action in safe mode', async () => {
    const actionIntent: VoiceIntent = {
      type: 'action',
      actionId: 'deleteSegment' as ActionId,
      raw: '删除这个',
      confidence: 0.6,
      fromFuzzy: true,
    };
    mockResolveVoiceIntent.mockResolvedValue({
      intent: actionIntent,
      llmFallbackFailed: false,
      llmResolvedAction: false,
      nextAliasMap: undefined,
      errorMessage: null,
    });
    mockShouldConfirmFuzzyAction.mockReturnValue(true);

    const opts = makeDefaultOptions({ safeModeRef: makeRefLike(true) });
    const { useVoiceAgentResultHandler } = await importHandler();
    const { result } = renderHook(() => useVoiceAgentResultHandler(opts));

    await act(async () => {
      await result.current(makeFinalResult('删除这个'));
    });

    expect(opts.setPendingConfirm).toHaveBeenCalledTimes(1);
    const confirmArg = (opts.setPendingConfirm as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(confirmArg).toMatchObject({
      actionId: 'deleteSegment',
      fromFuzzy: true,
    });
    expect(mockPlayTick).toHaveBeenCalledTimes(1);
    expect(opts.executeActionRef.current).not.toHaveBeenCalled();
  });
});
