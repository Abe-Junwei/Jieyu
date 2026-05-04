// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auditInsert = vi.fn().mockResolvedValue(undefined);

vi.mock('../db', () => ({
  getDb: vi.fn(async () => ({
    collections: { audit_logs: { insert: auditInsert } },
  })),
}));
import type { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { featureFlags } from '../ai/config/featureFlags';
import { getDefaultAiChatSettings } from '../ai/providers/providerCatalog';
import { isAiChatSendBlockedByAssistantDialogue } from './useAiChat.assistantDialogueSendGate';
import { runAiChatSendTurnPreflight } from './useAiChat.sendTurnPreflight';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import type { AiInteractionMetrics, AiSessionMemory, AiSystemPersonaKey, AiTaskSession, UiChatMessage } from './useAiChat.types';

vi.mock('./useAiChat.assistantDialogueSendGate', () => ({
  isAiChatSendBlockedByAssistantDialogue: vi.fn(() => false),
}));

const zeroMetrics: AiInteractionMetrics = {
  turnCount: 0,
  successCount: 0,
  failureCount: 0,
  clarifyCount: 0,
  explainFallbackCount: 0,
  cancelCount: 0,
  recoveryCount: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  currentTurnTokens: 0,
};

function makeArgs(over: Partial<RunAiChatSendTurnArgs> = {}): RunAiChatSendTurnArgs {
  const setMessages = vi.fn() as Dispatch<SetStateAction<UiChatMessage[]>>;
  const settings = getDefaultAiChatSettings('mock');
  const orchestrator = {
    sendMessage: vi.fn(() => ({
      stream: (async function* done() {
        yield { done: true as const };
      })(),
    })),
  } as unknown as ChatOrchestrator;
  const noopAsync = vi.fn().mockResolvedValue(undefined);
  const noop = vi.fn();

  return {
    userText: 'hello',
    featureFlags,
    isStreaming: false,
    sessionTokenBudget: 1_000_000,
    firstChunkTimeoutMs: 30_000,
    outputTokenCap: 4096,
    outputTokenRetryCap: 960,
    allowDestructiveToolCalls: true,
    maxContextCharsOverride: undefined,
    historyCharBudgetOverride: undefined,
    provider: { id: 'mock', label: 'Mock' },
    orchestrator,
    ensureConversation: vi.fn(async () => 'conv-1'),
    setLastError: noop as Dispatch<SetStateAction<string | null>>,
    setMessages,
    setIsStreaming: noop,
    setConnectionTestStatus: noop,
    setConnectionTestMessage: noop,
    setContextDebugSnapshot: noop,
    setMetrics: noop,
    setTaskSession: noop,
    setPendingToolCall: noop,
    messagesRef: { current: [] },
    metricsRef: { current: { ...zeroMetrics } },
    pendingToolCallRef: { current: null },
    sessionMemoryRef: { current: {} as AiSessionMemory },
    settingsRef: { current: settings },
    toolFeedbackLocaleRef: { current: 'zh-CN' },
    systemPersonaKeyRef: { current: 'transcription' as AiSystemPersonaKey },
    getContextRef: { current: () => null },
    embeddingSearchServiceRef: { current: undefined },
    ragContextTimeoutMsRef: { current: 5000 },
    toolDecisionModeRef: { current: 'enabled' },
    onToolRiskCheckRef: { current: undefined },
    preparePendingToolCallRef: { current: undefined },
    onToolCallRef: { current: undefined },
    taskSessionRef: { current: { id: 't1', status: 'idle', updatedAt: '2026-01-01T00:00:00.000Z' } as AiTaskSession },
    onMessageCompleteRef: { current: undefined },
    abortRef: { current: null },
    localToolCallCountRef: { current: 0 },
    streamPersistIntervalMsRef: { current: 1000 },
    backgroundMemoryRuntimeRef: { current: null },
    writeToolDecisionAuditLog: noopAsync,
    writeToolIntentAuditLog: noopAsync,
    hasPersistedExecutionForRequest: vi.fn(async () => false),
    markExecutedRequestId: noop,
    bumpMetric: noop,
    resolveAgentLoopResumeCheckpoint: vi.fn(async () => null),
    clearPendingAgentLoopCheckpoint: noop,
    ...over,
  };
}

describe('runAiChatSendTurnPreflight', () => {
  beforeEach(() => {
    auditInsert.mockClear();
    vi.mocked(isAiChatSendBlockedByAssistantDialogue).mockReset();
    vi.mocked(isAiChatSendBlockedByAssistantDialogue).mockReturnValue(false);
  });

  it('returns null when AI chat is disabled and surfaces disabled error', async () => {
    const setLastError = vi.fn();
    const args = makeArgs({
      featureFlags: { ...featureFlags, aiChatEnabled: false } as unknown as typeof featureFlags,
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).toBeNull();
    expect(setLastError).toHaveBeenCalledTimes(1);
    expect(String(setLastError.mock.calls[0]?.[0])).toMatch(/disabled|未启用|not enabled/i);
  });

  it('returns null when already streaming', async () => {
    const setLastError = vi.fn();
    const args = makeArgs({
      isStreaming: true,
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).toBeNull();
    expect(setLastError).toHaveBeenCalledTimes(1);
  });

  it('returns null for whitespace-only input without setting lastError', async () => {
    const setLastError = vi.fn();
    const args = makeArgs({
      userText: '   \n\t',
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).toBeNull();
    expect(setLastError).not.toHaveBeenCalled();
  });

  it('returns null when assistant dialogue gate blocks send', async () => {
    vi.mocked(isAiChatSendBlockedByAssistantDialogue).mockReturnValue(true);
    const setLastError = vi.fn();
    const args = makeArgs({
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).toBeNull();
    expect(setLastError).toHaveBeenCalledTimes(1);
  });

  it('returns null when session token budget would be exceeded', async () => {
    const setLastError = vi.fn();
    const bumpMetric = vi.fn();
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const args = makeArgs({
      userText: 'hello',
      sessionTokenBudget: 10,
      metricsRef: {
        current: {
          ...zeroMetrics,
          totalInputTokens: 9,
          totalOutputTokens: 0,
        },
      },
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
      bumpMetric,
      writeToolDecisionAuditLog,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).toBeNull();
    expect(writeToolDecisionAuditLog).toHaveBeenCalled();
    expect(bumpMetric).toHaveBeenCalledWith('failureCount');
    expect(setLastError).toHaveBeenCalledTimes(1);
  });

  it('returns a preflight context when guards pass', async () => {
    const setMessages = vi.fn();
    const setIsStreaming = vi.fn();
    const args = makeArgs({
      userText: '  ping ',
      setMessages: setMessages as unknown as Dispatch<SetStateAction<UiChatMessage[]>>,
      setIsStreaming: setIsStreaming as unknown as Dispatch<SetStateAction<boolean>>,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).not.toBeNull();
    expect(result?.correlationId.length).toBeGreaterThan(0);
    expect(result?.trimmed).toBe('ping');
    expect(setIsStreaming).toHaveBeenCalledWith(true);
    expect(setMessages).toHaveBeenCalled();
  });

  it('skips send-preflight user directives when session sidecar sandbox denies writes', async () => {
    const sessionMemoryRef = { current: {} as AiSessionMemory };
    const setMessages = vi.fn();
    const setIsStreaming = vi.fn();
    const args = makeArgs({
      userText: '请记住：所有回答用英文',
      featureFlags: { ...featureFlags, aiBackgroundToolSandboxEnabled: true } as unknown as typeof featureFlags,
      sendPreflightSessionSidecarSandboxProfileOverride: 'readonly',
      sessionMemoryRef,
      setMessages: setMessages as unknown as Dispatch<SetStateAction<UiChatMessage[]>>,
      setIsStreaming: setIsStreaming as unknown as Dispatch<SetStateAction<boolean>>,
    });
    const result = await runAiChatSendTurnPreflight(args);
    expect(result).not.toBeNull();
    expect(sessionMemoryRef.current.responsePreferences?.language).not.toBe('en');
  });

  it('writes session sidecar sandbox audit when send-preflight directives are blocked', async () => {
    const ensureConversation = vi.fn(async () => 'conv-audit-1');
    const sessionMemoryRef = { current: {} as AiSessionMemory };
    const setMessages = vi.fn();
    const setIsStreaming = vi.fn();
    const args = makeArgs({
      userText: '请记住：所有回答用英文',
      featureFlags: { ...featureFlags, aiBackgroundToolSandboxEnabled: true } as unknown as typeof featureFlags,
      sendPreflightSessionSidecarSandboxProfileOverride: 'readonly',
      activeConversationId: null,
      ensureConversation,
      sessionMemoryRef,
      setMessages: setMessages as unknown as Dispatch<SetStateAction<UiChatMessage[]>>,
      setIsStreaming: setIsStreaming as unknown as Dispatch<SetStateAction<boolean>>,
    });
    await runAiChatSendTurnPreflight(args);
    await Promise.resolve();
    await Promise.resolve();
    expect(ensureConversation).toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalled();
    const row = auditInsert.mock.calls.find((call) => (call[0] as { field?: string }).field === 'ai_session_sidecar_sandbox')?.[0] as
      | { field: string; documentId: string; metadataJson: string }
      | undefined;
    expect(row?.documentId).toBe('conv-audit-1');
    const meta = JSON.parse(row!.metadataJson) as { gate: string };
    expect(meta.gate).toContain('send-preflight');
  });
});
