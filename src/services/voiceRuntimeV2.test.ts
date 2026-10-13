import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ai/config/featureFlags', async (orig) => {
  const mod = await orig<typeof import('../ai/config/featureFlags')>();
  return { ...mod, featureFlags: { ...mod.featureFlags, aiAgentRuntimeV2Enabled: true } };
});
const auditSpy = vi.fn(async () => 'req');
vi.mock('./voiceActionAudit', () => ({
  writeVoiceActionAudit: (...a: unknown[]) => auditSpy(...(a as [])),
}));
vi.mock('./EarconService', () => ({ playTick: vi.fn(), playSuccess: vi.fn(), playError: vi.fn() }));

import { resolveVoiceIntent, VOICE_LLM_INTENT_TIMEOUT_MS } from './voiceIntentResolution';
import {
  dispatchResolvedVoiceIntent,
  type DispatchResolvedVoiceIntentInput,
} from './assistantVoiceIntentDispatch';
import type { VoiceIntent } from './IntentRouter';

const stt = { text: '删掉这句', confidence: 0.9, lang: 'zh' } as never;
const chatIntent = { type: 'chat', text: '删掉这句', raw: '删掉这句' } as unknown as VoiceIntent;
const actionIntent = {
  type: 'action',
  actionId: 'deleteSegment',
  raw: '删掉这句',
} as unknown as VoiceIntent;

function deps() {
  return {
    routeIntent: vi.fn(() => chatIntent),
    learnVoiceIntentAlias: vi.fn(() => ({
      applied: true,
      aliasMap: { 删掉这句: 'deleteSegment' as never },
    })),
    bumpAliasUsage: vi.fn(),
    refineLlmFallbackIntent: vi.fn((i: VoiceIntent) => i),
  };
}
const input = (resolveIntentWithLlm: () => Promise<VoiceIntent | null>) => ({
  result: stt,
  mode: 'command' as never,
  session: { id: 's', entries: [] } as never,
  aliasMap: {},
  locale: 'zh-CN' as never,
  resolveIntentWithLlm,
});

function dispatchInput(
  over: Partial<DispatchResolvedVoiceIntentInput>,
): DispatchResolvedVoiceIntentInput {
  return {
    locale: 'zh-CN' as never,
    safeMode: false,
    sessionId: 'sess',
    intent: actionIntent,
    sttResult: stt,
    llmFallbackFailed: false,
    intentRouter: {
      shouldConfirmFuzzyAction: () => false,
      isDestructiveAction: (id) => id === 'deleteSegment',
    },
    executeAction: vi.fn(),
    queueAiThinking: vi.fn(),
    setError: vi.fn(),
    setAgentState: vi.fn(),
    setPendingConfirm: vi.fn(),
    inputModality: 'voice',
    ...over,
  };
}

beforeEach(() => auditSpy.mockClear());
afterEach(() => vi.useRealTimers());

describe('voice under aiAgentRuntimeV2Enabled', () => {
  it('1.5 s timeout: late LLM result is discarded, nothing learned', async () => {
    vi.useFakeTimers();
    const d = deps();
    let resolveLate!: (v: VoiceIntent) => void;
    const llm = vi.fn(
      () =>
        new Promise<VoiceIntent>((r) => {
          resolveLate = r;
        }),
    );
    const pending = resolveVoiceIntent(d, input(llm));
    await vi.advanceTimersByTimeAsync(VOICE_LLM_INTENT_TIMEOUT_MS);
    const out = await pending;
    resolveLate(actionIntent);
    expect(out).toMatchObject({
      llmTimedOut: true,
      llmFallbackFailed: true,
      llmResolvedAction: false,
    });
    expect(out.intent.type).toBe('chat');
    expect(out.learnAliasAfterExecution).toBeUndefined();
    expect(llm).toHaveBeenCalledTimes(1);
    expect(d.learnVoiceIntentAlias).not.toHaveBeenCalled();
  });

  it('alias is not learned during resolution, only when the dispatcher executes', async () => {
    const d = deps();
    d.routeIntent.mockReturnValue(chatIntent);
    const playIntent = {
      type: 'action',
      actionId: 'playPause',
      raw: '删掉这句',
    } as unknown as VoiceIntent;
    const out = await resolveVoiceIntent(
      d,
      input(async () => playIntent),
    );
    expect(d.learnVoiceIntentAlias).not.toHaveBeenCalled();
    expect(out.nextAliasMap).toBeUndefined();
    const learn = vi.fn(() => out.learnAliasAfterExecution?.());
    const executeAction = vi.fn();
    await dispatchResolvedVoiceIntent(
      dispatchInput({
        intent: playIntent,
        executeAction,
        learnAliasAfterExecution: learn,
        llmResolvedAction: true,
      }),
    );
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(d.learnVoiceIntentAlias).toHaveBeenCalledTimes(1);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'playPause', decision: 'auto_confirmed' }),
    );
  });

  it('destructive action asks for confirmation even with safeMode off; no execution, no alias', async () => {
    const executeAction = vi.fn();
    const learn = vi.fn();
    const setPendingConfirm = vi.fn();
    await dispatchResolvedVoiceIntent(
      dispatchInput({
        executeAction,
        learnAliasAfterExecution: learn,
        setPendingConfirm,
        llmResolvedAction: true,
      }),
    );
    expect(setPendingConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'deleteSegment' }),
    );
    expect(executeAction).not.toHaveBeenCalled();
    expect(learn).not.toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'deleteSegment', decision: 'pending' }),
    );
  });

  it('tool intents go to the chat turn (shared pipeline), not straight to the tool handler', async () => {
    const executeVoiceToolCall = vi.fn();
    const sendToAiChat = vi.fn();
    const toolIntent = {
      type: 'tool',
      toolName: 'delete_transcription_segment',
      params: {},
      raw: '删除第一句',
    } as unknown as VoiceIntent;
    await dispatchResolvedVoiceIntent(
      dispatchInput({ intent: toolIntent, executeVoiceToolCall, sendToAiChat }),
    );
    expect(sendToAiChat).toHaveBeenCalledWith('删除第一句');
    expect(executeVoiceToolCall).not.toHaveBeenCalled();
  });
});
