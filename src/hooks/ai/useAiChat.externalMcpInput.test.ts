// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ai/config/featureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/config/featureFlags')>();
  return {
    ...actual,
    featureFlags: {
      ...actual.featureFlags,
      aiExternalMcpTrustEnabled: true,
      aiExternalMcpHttpClientEnabled: true,
      aiExternalMcpSendTurnEnabled: true,
      aiSemanticGuardEnabled: true,
      aiAgentUiPreviewEnabled: true,
    },
  };
});

import { renderHook } from '@testing-library/react';
import { resetJieyuDatabaseSingletonForTests } from '../../db';
import { getDefaultAiChatSettings } from '../../ai/providers/providerCatalog';
import { setExternalMcpTrustEnabled } from '../../ai/mcp/client/externalMcpTrustRegistry';
import { encodeExternalMcpToolName } from '../../ai/mcp/client/externalMcpTurnBridge';
import { t } from '../../i18n';
import { getDefaultAgentUiEventBus } from '../../ai/runtime/agentUiEvents';
import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';
import { useAiChatPendingToolCall } from './useAiChat.pendingToolCall';
import { buildExternalMcpInputPendingCall } from './useAiChat.externalMcpInput';
import type { AiSessionMemory, PendingAiToolCall } from './useAiChat.types';

const ORIGIN = 'https://mcp.example.test/mcp';
const SAFE_TOOLS = [{ name: 'search_works', description: 'Search OpenAlex works by title.' }];
const TOOL = encodeExternalMcpToolName(ORIGIN, 'search_works');

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function inputRequired(requestState: string, message: string) {
  return {
    resultType: 'input_required',
    requestState,
    inputRequests: {
      github_login: {
        method: 'elicitation/create',
        params: {
          mode: 'form',
          message,
          requestedSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
      },
    },
  };
}

type ToolsCallHandler = (params: Record<string, unknown>) => unknown;
const toolsCalls: Array<Record<string, unknown>> = [];
let onToolsCall: ToolsCallHandler = () => ({ content: [{ type: 'text', text: 'ok' }] });
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await resetJieyuDatabaseSingletonForTests();
  await setExternalMcpTrustEnabled({ origin: ORIGIN, enabled: true, tools: SAFE_TOOLS });
  toolsCalls.length = 0;
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      id?: unknown;
      method?: string;
      params?: Record<string, unknown>;
    };
    if (body.method === 'tools/list') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools: SAFE_TOOLS } });
    }
    toolsCalls.push(body.params ?? {});
    const result = onToolsCall(body.params ?? {});
    if (result instanceof Response) return result;
    return jsonResponse({ jsonrpc: '2.0', id: body.id, result });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function legacyEnv(setPendingToolCall: (value: PendingAiToolCall | null) => void) {
  return {
    messages: [],
    providerId: 'mock',
    model: 'mock-model',
    toolFeedbackLocale: 'en-US' as const,
    toolDecisionMode: 'enabled' as const,
    toolFeedbackStyle: 'detailed' as const,
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    sessionMemory: {} as AiSessionMemory,
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
    setTaskSession: vi.fn(),
    setPendingToolCall,
    taskSessionId: 'task-1',
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    shouldBumpRecovery: false,
    genRequestId: () => 'req-gen',
    localToolCallCountRef: { current: 0 },
    turnConversationId: 'conv-1',
  };
}

describe('legacy runtime: external MCP asks for input', () => {
  it('keeps requestState and the server question out of the stored reply and shows the card', async () => {
    onToolsCall = () => inputRequired('SECRET-STATE', 'Please provide your GitHub username');
    const setPendingToolCall = vi.fn();
    const result = await resolveAiChatStreamCompletion({
      assistantId: 'ast-1',
      assistantContent: JSON.stringify({ tool_call: { name: TOOL, arguments: { q: 'x' } } }),
      userText: 'search',
      aiContext: null,
      ...legacyEnv(setPendingToolCall),
    });

    expect(result.finalContent).toBe(t('en-US', 'ai.externalMcp.inputNeeded'));
    expect(result.finalContent).not.toContain('SECRET-STATE');
    expect(result.finalContent).not.toContain('requestState');
    expect(result.finalContent).not.toContain('GitHub');
    expect(result.finalStatus).toBe('done');

    const card = setPendingToolCall.mock.calls.at(-1)?.[0] as PendingAiToolCall;
    expect(card.mcpInput?.requestState).toBe('SECRET-STATE');
    expect(card.mcpInput?.requests[0]?.message).toBe('Please provide your GitHub username');
    expect(card.call.name).toBe(TOOL);
    expect(card.conversationIdAtCapture).toBe('conv-1');
  });
});

function inputCard(requestState: string): PendingAiToolCall {
  return buildExternalMcpInputPendingCall({
    name: TOOL,
    form: {
      origin: ORIGIN,
      toolName: 'search_works',
      arguments: { q: 'x' },
      requestState,
      requests: [
        {
          id: 'github_login',
          message: 'Please provide your GitHub username',
          fields: [{ name: 'name', required: true }],
        },
      ],
    },
    assistantMessageId: 'ast-1',
    requestId: 'req-1',
    conversationId: 'conv-1',
  });
}

function renderPendingCard(card: PendingAiToolCall) {
  const pendingRef = { current: card as PendingAiToolCall | null };
  const stored = new Map<string, { content: string; status: string | undefined }>();
  const audits: string[] = [];
  const setPendingToolCall = vi.fn((value: unknown) => {
    pendingRef.current =
      typeof value === 'function'
        ? (value as (prev: PendingAiToolCall | null) => PendingAiToolCall | null)(
            pendingRef.current,
          )
        : (value as PendingAiToolCall | null);
  });
  const { result } = renderHook(() =>
    useAiChatPendingToolCall({
      providerId: 'mock',
      settingsRef: { current: getDefaultAiChatSettings('mock') },
      toolDecisionModeRef: { current: 'enabled' },
      pendingToolCallRef: pendingRef,
      taskSessionRef: { current: { id: 'task-1', status: 'idle', updatedAt: '' } },
      sessionMemoryRef: { current: {} as AiSessionMemory },
      toolFeedbackLocale: 'en-US',
      applyAssistantMessageResult: async (id, content, status) => {
        stored.set(id, { content, status });
      },
      hasPersistedExecutionForRequest: async () => false,
      writeToolDecisionAuditLog: async (_id, _oldValue, newValue) => {
        audits.push(newValue);
      },
      markExecutedRequestId: vi.fn(),
      setPendingToolCall,
      setTaskSession: vi.fn(),
      bumpMetric: vi.fn(),
      conversationIdRef: { current: 'conv-1' },
    }),
  );
  return { hook: result, pendingRef, stored, audits };
}

const filled = { 'github_login.name': 'octocat' };

describe('MCP input card: confirm', () => {
  it('keeps the card when a required field is empty and sends nothing', async () => {
    const { hook, pendingRef, stored } = renderPendingCard(inputCard('STATE-1'));
    await hook.current.confirmPendingToolCall({});
    expect(toolsCalls).toHaveLength(0);
    expect(pendingRef.current?.mcpInput?.requestState).toBe('STATE-1');
    expect(stored.size).toBe(0);
  });

  it('when the server asks again, updates the card and submits the NEW requestState next time', async () => {
    onToolsCall = (params) =>
      params.requestState === 'STATE-2'
        ? { content: [{ type: 'text', text: 'done' }] }
        : inputRequired('STATE-2', 'Please also give your org');
    const { hook, pendingRef, stored, audits } = renderPendingCard(inputCard('STATE-1'));

    await hook.current.confirmPendingToolCall(filled);
    expect(toolsCalls.at(-1)?.requestState).toBe('STATE-1');
    expect(pendingRef.current?.mcpInput?.requestState).toBe('STATE-2');
    expect(pendingRef.current?.riskSummary).toBe('Please also give your org');
    expect(stored.get('ast-1')?.content).toBe(t('en-US', 'ai.externalMcp.inputAskedAgain'));
    expect(audits).toContain(`input_required_again:${TOOL}`);

    await hook.current.confirmPendingToolCall(filled);
    expect(toolsCalls.at(-1)?.requestState).toBe('STATE-2');
    expect(pendingRef.current).toBeNull();
  });

  it('clears the card, stores a localized error and audits when the call cannot recover', async () => {
    onToolsCall = () => new Response('nope', { status: 500 });
    const { hook, pendingRef, stored, audits } = renderPendingCard(inputCard('STATE-1'));
    await hook.current.confirmPendingToolCall(filled);
    expect(pendingRef.current).toBeNull();
    expect(stored.get('ast-1')).toEqual({
      content: t('en-US', 'ai.externalMcp.inputFailed'),
      status: 'error',
    });
    expect(audits).toContain(`confirm_failed:${TOOL}:http_error`);
  });
});

describe('MCP input card: user-facing results', () => {
  it('stores a localized notice on success, never the tool result', async () => {
    onToolsCall = () => ({ content: [{ type: 'text', text: '{"count":42}' }] });
    const { hook, pendingRef, stored, audits } = renderPendingCard(inputCard('STATE-1'));
    await hook.current.confirmPendingToolCall(filled);
    expect(pendingRef.current).toBeNull();
    expect(stored.get('ast-1')).toEqual({
      content: t('en-US', 'ai.externalMcp.inputSubmitted'),
      status: 'done',
    });
    expect(stored.get('ast-1')?.content).not.toContain('count');
    expect(audits).toContain(`approved:${TOOL}:input_submitted`);
  });

  it('cancelling stores a localized notice without the encoded name and is not a write cancel', async () => {
    const events: string[] = [];
    const unsubscribe = getDefaultAgentUiEventBus().subscribe((event) => events.push(event.kind));
    const { hook, pendingRef, stored, audits } = renderPendingCard(inputCard('STATE-1'));
    await hook.current.cancelPendingToolCall();
    unsubscribe();
    expect(pendingRef.current).toBeNull();
    expect(stored.get('ast-1')?.content).toBe(t('en-US', 'ai.externalMcp.inputCancelled'));
    expect(stored.get('ast-1')?.content).not.toContain('extmcp__');
    expect(audits).toContain(`cancelled:${TOOL}`);
    expect(events).not.toContain('write_cancelled');
    expect(toolsCalls).toHaveLength(0);
  });
});
