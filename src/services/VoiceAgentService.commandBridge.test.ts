// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectAndRecordMemoryPattern, handleFinalSttResult, type CommandBridgeContext } from './VoiceAgentService.commandBridge';
import type { VoiceSession } from './IntentRouter';
import type { SttResult } from './VoiceInputService';
import { t, tf, type Locale } from '../i18n';
const {
  mockRouteIntent,
  mockIsDestructiveAction,
  mockShouldConfirmFuzzyAction,
  mockGetActionLabel,
  mockLearnVoiceIntentAlias,
  mockBumpAliasUsage,
  mockConfirmTerm,
  mockRecordPhrase,
  mockPlayTick,
  mockPlaySuccess,
  mockPlayError,
  mockMarkSessionStart,
  mockRecordAction,
} = vi.hoisted(() => ({
  mockRouteIntent: vi.fn(),
  mockIsDestructiveAction: vi.fn(() => false),
  mockShouldConfirmFuzzyAction: vi.fn(() => false),
  mockGetActionLabel: vi.fn(() => 'Delete segment'),
  mockLearnVoiceIntentAlias: vi.fn(() => ({ applied: false, aliasMap: {} })),
  mockBumpAliasUsage: vi.fn(),
  mockConfirmTerm: vi.fn(async () => undefined),
  mockRecordPhrase: vi.fn(async () => undefined),
  mockPlayTick: vi.fn(),
  mockPlaySuccess: vi.fn(),
  mockPlayError: vi.fn(),
  mockMarkSessionStart: vi.fn(),
  mockRecordAction: vi.fn(),
}));

vi.mock('./IntentRouter', () => ({
  routeIntent: mockRouteIntent,
  isDestructiveAction: mockIsDestructiveAction,
  shouldConfirmFuzzyAction: mockShouldConfirmFuzzyAction,
  getActionLabel: mockGetActionLabel,
  learnVoiceIntentAlias: mockLearnVoiceIntentAlias,
  bumpAliasUsage: mockBumpAliasUsage,
}));

vi.mock('./EarconService', () => ({
  playTick: mockPlayTick,
  playSuccess: mockPlaySuccess,
  playError: mockPlayError,
}));

vi.mock('./GlobalContextService', () => ({
  globalContext: {
    markSessionStart: mockMarkSessionStart,
  },
}));

vi.mock('./UserBehaviorStore', () => ({
  userBehaviorStore: {
    recordAction: mockRecordAction,
  },
}));

vi.mock('./ProjectMemoryStore', () => ({
  projectMemoryStore: {
    confirmTerm: mockConfirmTerm,
    recordPhrase: mockRecordPhrase,
  },
}));

function makeSession(): VoiceSession {
  return {
    id: 'voice-session-1',
    startedAt: 1,
    entries: [],
    mode: 'command',
  };
}

function makeResult(text: string): SttResult {
  return {
    text,
    lang: 'zh-CN',
    isFinal: true,
    confidence: 0.92,
    engine: 'web-speech',
  };
}

function makeContext(
  locale: Locale,
  overrides: Partial<CommandBridgeContext> = {},
): CommandBridgeContext {
  return {
    mode: 'command',
    safeMode: false,
    session: makeSession(),
    locale,
    corpusLang: 'cmn',
    intentAliasMap: {},
    setState: vi.fn(),
    emitStateChange: vi.fn(),
    onSendToAiChat: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('VoiceAgentService command bridge', () => {
  it('reports the localized unrecognized-command error when command-mode fallback returns null', async () => {
    mockRouteIntent.mockReturnValue({
      type: 'chat',
      text: 'ignored',
      raw: '帮我处理这里',
    });
    const resolveIntentWithLlm = vi.fn(async () => null);
    const ctx = makeContext('zh-CN', { resolveIntentWithLlm });

    await handleFinalSttResult(ctx, makeResult('帮我处理这里'));

    expect(resolveIntentWithLlm).toHaveBeenCalledWith({
      text: '帮我处理这里',
      mode: 'command',
      session: ctx.session,
    });
    expect(ctx.setState).toHaveBeenCalledWith({
      error: t('zh-CN', 'transcription.voice.error.nonDictationIntentUnrecognized'),
    });
  });

  it('reports the localized unrecognized-intent error when analysis-mode fallback returns null', async () => {
    mockRouteIntent.mockReturnValue({
      type: 'chat',
      text: 'ignored',
      raw: '分析这段内容',
    });
    const resolveIntentWithLlm = vi.fn(async () => null);
    const ctx = makeContext('zh-CN', { mode: 'analysis', resolveIntentWithLlm });

    await handleFinalSttResult(ctx, makeResult('分析这段内容'));

    expect(resolveIntentWithLlm).toHaveBeenCalledWith({
      text: '分析这段内容',
      mode: 'analysis',
      session: ctx.session,
    });
    expect(ctx.setState).toHaveBeenCalledWith({
      error: t('zh-CN', 'transcription.voice.error.nonDictationIntentUnrecognized'),
    });
  });

  it('sends the localized tool-success prefix to AI chat in English', async () => {
    mockRouteIntent.mockReturnValue({
      type: 'tool',
      toolName: 'delete_transcription_segment',
      params: { segmentId: 'seg-1' },
      raw: 'delete this segment',
    });
    const onToolCall = vi.fn(async () => ({ ok: true, message: 'Deleted.' }));
    const onSendToAiChat = vi.fn();
    const ctx = makeContext('en-US', { onToolCall, onSendToAiChat });

    await handleFinalSttResult(ctx, makeResult('delete this segment'));

    expect(onToolCall).toHaveBeenCalledWith({
      name: 'delete_transcription_segment',
      arguments: { segmentId: 'seg-1' },
    });
    expect(onSendToAiChat).toHaveBeenCalledWith(
      tf('en-US', 'transcription.voice.chatPrefix.toolSuccess', {
        toolName: 'delete_transcription_segment',
        message: 'Deleted.',
      }),
    );
    expect(mockPlaySuccess).toHaveBeenCalledTimes(1);
  });

  it('sends the localized slot-fill prefix to AI chat in English', async () => {
    mockRouteIntent.mockReturnValue({
      type: 'slot-fill',
      slotName: 'speaker',
      value: 'Alice',
      raw: 'speaker is Alice',
    });
    const onSendToAiChat = vi.fn();
    const ctx = makeContext('en-US', { onSendToAiChat });

    await handleFinalSttResult(ctx, makeResult('speaker is Alice'));

    expect(onSendToAiChat).toHaveBeenCalledWith(
      tf('en-US', 'transcription.voice.chatPrefix.slotFill', {
        slotName: 'speaker',
        value: 'Alice',
      }),
    );
  });

  it('records confirmed term memory patterns after the scanner-safe rewrite', () => {
    detectAndRecordMemoryPattern('记住这个词 "foo"，这是术语解释', 'cmn');

    expect(mockConfirmTerm).toHaveBeenCalledWith('foo', '这是术语解释', 'cmn');
    expect(mockRecordPhrase).not.toHaveBeenCalled();
  });

  it('keeps the existing LLM fallback path active even when hybrid resolver returns a confident advisory result', async () => {
    mockRouteIntent.mockReturnValue({
      type: 'chat',
      text: 'ignored',
      raw: '删除这个',
    });
    const resolveIntentHybrid = vi.fn(async () => ({
      intent: 'delete' as const,
      action: 'delete_segment',
      scope: 'current_scope' as const,
      confidence: 0.95,
      needsClarification: false,
      methodology: 'hybrid' as const,
    }));
    const resolveIntentWithLlm = vi.fn(async () => null);
    const ctx = makeContext('zh-CN', { resolveIntentHybrid, resolveIntentWithLlm });

    await handleFinalSttResult(ctx, makeResult('删除这个'));

    expect(resolveIntentHybrid).toHaveBeenCalledTimes(1);
    expect(resolveIntentWithLlm).toHaveBeenCalledTimes(1);
  });

  it('swallows hybrid resolver errors and continues with the normal fallback path', async () => {
    mockRouteIntent.mockReturnValue({
      type: 'chat',
      text: 'ignored',
      raw: '帮我处理这里',
    });
    const resolveIntentHybrid = vi.fn(async () => {
      throw new Error('hybrid exploded');
    });
    const resolveIntentWithLlm = vi.fn(async () => null);
    const ctx = makeContext('zh-CN', { resolveIntentHybrid, resolveIntentWithLlm });

    await expect(handleFinalSttResult(ctx, makeResult('帮我处理这里'))).resolves.toBeTruthy();
    expect(resolveIntentWithLlm).toHaveBeenCalledTimes(1);
  });

  it('records confirmed phrase memory patterns after the scanner-safe rewrite', () => {
    detectAndRecordMemoryPattern('常见说法是 "how are you"，你好吗', 'cmn');

    expect(mockRecordPhrase).toHaveBeenCalledWith('how are you', '你好吗', 'voice-confirmed');
    expect(mockConfirmTerm).not.toHaveBeenCalled();
  });
});