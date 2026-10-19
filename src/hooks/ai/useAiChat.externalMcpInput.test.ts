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
    },
  };
});

import { resetJieyuDatabaseSingletonForTests } from '../../db';
import { setExternalMcpTrustEnabled } from '../../ai/mcp/client/externalMcpTrustRegistry';
import { encodeExternalMcpToolName } from '../../ai/mcp/client/externalMcpTurnBridge';
import { t } from '../../i18n';
import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';
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
    return jsonResponse({ jsonrpc: '2.0', id: body.id, result: onToolsCall(body.params ?? {}) });
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
