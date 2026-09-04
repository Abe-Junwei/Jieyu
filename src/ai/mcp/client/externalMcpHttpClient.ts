/**
 * B13 — outbound Streamable HTTP MCP client (JSON-RPC 2.0 subset).
 * Does not use @modelcontextprotocol/sdk. Network only after B11 enablement.
 */

import { featureFlags } from '../../config/featureFlags';
import { persistMcpToolCallAudit } from '../server/mcpToolCallAudit';
import type { JsonRpcRequest, JsonRpcResponse, McpToolCallResult } from '../server/types';
import {
  exposeExternalMcpToolsToLlm,
  getExternalMcpTrustEntry,
  normalizeExternalMcpOrigin,
  persistExternalMcpLastToolsJson,
  type ExternalMcpExposeDenial,
  type ExternalMcpToolSchema,
} from './externalMcpTrustRegistry';

import {
  isExternalMcpWriteRpcMethod,
  MCP_STREAMABLE_HTTP_PROTOCOL_VERSION,
  parseJsonRpcFromHttpBody,
} from './externalMcpHttpTransport';

export {
  isExternalMcpWriteRpcMethod,
  MCP_STREAMABLE_HTTP_PROTOCOL_VERSION,
  parseJsonRpcFromHttpBody,
};

const DEFAULT_TIMEOUT_MS = 15_000;

export type ExternalMcpHttpDenial =
  | ExternalMcpExposeDenial
  | 'http_client_flag_off'
  | 'write_method_not_supported'
  | 'http_error'
  | 'rpc_error'
  | 'invalid_response';

export type ExternalMcpHttpListResult<T extends ExternalMcpToolSchema> =
  | { ok: true; origin: string; tools: readonly T[] }
  | {
      ok: false;
      reason: ExternalMcpHttpDenial;
      message?: string;
      blockReasons?: readonly string[];
    };

export type ExternalMcpHttpCallResult =
  | { ok: true; origin: string; result: McpToolCallResult }
  | {
      ok: false;
      reason: ExternalMcpHttpDenial;
      message?: string;
      blockReasons?: readonly string[];
    };

type FetchLike = typeof fetch;

function nextRpcId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function assertOriginReady(
  rawOrigin: string,
): Promise<{ ok: true; origin: string } | { ok: false; reason: ExternalMcpHttpDenial }> {
  if (!featureFlags.aiExternalMcpHttpClientEnabled)
    return { ok: false, reason: 'http_client_flag_off' };
  if (!featureFlags.aiExternalMcpTrustEnabled) return { ok: false, reason: 'flag_off' };
  const origin = normalizeExternalMcpOrigin(rawOrigin);
  if (!origin) return { ok: false, reason: 'invalid_origin' };
  const entry = await getExternalMcpTrustEntry(origin);
  if (!entry) return { ok: false, reason: 'unregistered' };
  if (!entry.enabled) return { ok: false, reason: 'disabled' };
  return { ok: true, origin };
}

async function postJsonRpc(input: {
  endpoint: string;
  request: JsonRpcRequest;
  authToken?: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
}): Promise<
  | { ok: true; response?: JsonRpcResponse }
  | { ok: false; reason: ExternalMcpHttpDenial; message: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': MCP_STREAMABLE_HTTP_PROTOCOL_VERSION,
    };
    if (input.authToken) headers.Authorization = `Bearer ${input.authToken}`;
    const res = await input.fetchImpl(input.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(input.request),
      signal: controller.signal,
    });
    if (res.status === 202) return { ok: true };
    const text = await res.text();
    if (!res.ok) return { ok: false, reason: 'http_error', message: `HTTP ${res.status}` };
    const parsed = parseJsonRpcFromHttpBody(
      res.headers.get('content-type') ?? 'application/json',
      text,
    );
    if (!parsed)
      return { ok: false, reason: 'invalid_response', message: 'Unparseable MCP response' };
    if (parsed.error) {
      return {
        ok: false,
        reason: 'rpc_error',
        message: parsed.error.message || `RPC ${parsed.error.code}`,
      };
    }
    return { ok: true, response: parsed };
  } catch (err) {
    return {
      ok: false,
      reason: 'http_error',
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function asToolSchemas(result: unknown): ExternalMcpToolSchema[] {
  const tools = (result as { tools?: unknown } | undefined)?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((tool): tool is Record<string, unknown> => !!tool && typeof tool === 'object')
    .map((tool) => ({
      name: String(tool.name ?? ''),
      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
    }))
    .filter((tool) => tool.name.trim().length > 0);
}

async function persistOutboundAudit(
  input: Omit<Parameters<typeof persistMcpToolCallAudit>[0], 'runtimeContext' | 'agentRunId'>,
  agentRunId?: string,
): Promise<void> {
  if (agentRunId) {
    await persistMcpToolCallAudit({ ...input, runtimeContext: { agentRunId }, agentRunId });
    return;
  }
  await persistMcpToolCallAudit({ ...input, runtimeContext: {} });
}

export async function invokeExternalMcpJsonRpc(input: {
  origin: string;
  method: string;
  params?: Record<string, unknown>;
  agentRunId?: string;
  authToken?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<
  | { ok: true; origin: string; result?: unknown }
  | { ok: false; reason: ExternalMcpHttpDenial; message?: string }
> {
  if (isExternalMcpWriteRpcMethod(input.method)) {
    return { ok: false, reason: 'write_method_not_supported', message: 'not_supported' };
  }
  const ready = await assertOriginReady(input.origin);
  if (!ready.ok) return ready;
  const jsonRpcId = nextRpcId();
  const rpc = await postJsonRpc({
    endpoint: ready.origin,
    request: {
      jsonrpc: '2.0',
      id: jsonRpcId,
      method: input.method,
      ...(input.params ? { params: input.params } : {}),
    },
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: input.fetchImpl ?? fetch,
    ...(input.authToken ? { authToken: input.authToken } : {}),
  });
  if (!rpc.ok) {
    return { ok: false, reason: rpc.reason, ...(rpc.message ? { message: rpc.message } : {}) };
  }
  return { ok: true, origin: ready.origin, result: rpc.response?.result };
}

export async function listExternalMcpToolsViaHttp<T extends ExternalMcpToolSchema>(input: {
  origin: string;
  agentRunId?: string;
  authToken?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<ExternalMcpHttpListResult<T>> {
  const startedAtMs = Date.now();
  const jsonRpcId = nextRpcId();
  const rpc = await invokeExternalMcpJsonRpc({ ...input, method: 'tools/list' });
  if (!rpc.ok) {
    if (
      rpc.reason === 'http_client_flag_off' ||
      rpc.reason === 'flag_off' ||
      rpc.reason === 'invalid_origin' ||
      rpc.reason === 'unregistered' ||
      rpc.reason === 'disabled' ||
      rpc.reason === 'write_method_not_supported'
    ) {
      return rpc;
    }
    await persistOutboundAudit(
      {
        jsonRpcId,
        toolName: 'tools/list',
        arguments: {},
        startedAtMs,
        outcome: 'execution_error',
        error: { message: rpc.message ?? rpc.reason },
      },
      input.agentRunId,
    );
    return rpc;
  }
  const tools = asToolSchemas(rpc.result) as T[];
  const exposed = await exposeExternalMcpToolsToLlm({ origin: rpc.origin, tools });
  if (!exposed.allowed) {
    await persistOutboundAudit(
      {
        jsonRpcId,
        toolName: 'tools/list',
        arguments: {},
        startedAtMs,
        outcome: 'validation_error',
        error: { message: exposed.reason },
      },
      input.agentRunId,
    );
    return {
      ok: false,
      reason: exposed.reason,
      ...(exposed.blockReasons ? { blockReasons: exposed.blockReasons } : {}),
    };
  }
  await persistOutboundAudit(
    {
      jsonRpcId,
      toolName: 'tools/list',
      arguments: {},
      startedAtMs,
      outcome: 'success',
    },
    input.agentRunId,
  );
  await persistExternalMcpLastToolsJson({ origin: exposed.origin, tools: exposed.tools });
  return { ok: true, origin: exposed.origin, tools: exposed.tools };
}

export async function callExternalMcpToolViaHttp(input: {
  origin: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  agentRunId?: string;
  authToken?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<ExternalMcpHttpCallResult> {
  const startedAtMs = Date.now();
  const jsonRpcId = nextRpcId();
  const listed = await listExternalMcpToolsViaHttp(input);
  if (!listed.ok) return listed;
  if (!listed.tools.some((tool) => tool.name === input.toolName)) {
    await persistOutboundAudit(
      {
        jsonRpcId,
        toolName: input.toolName,
        arguments: input.arguments ?? {},
        startedAtMs,
        outcome: 'tool_not_found',
        error: { code: -32601, message: `Tool not found: ${input.toolName}` },
      },
      input.agentRunId,
    );
    return { ok: false, reason: 'rpc_error', message: `Tool not found: ${input.toolName}` };
  }
  const rpc = await invokeExternalMcpJsonRpc({
    ...input,
    method: 'tools/call',
    params: { name: input.toolName, arguments: input.arguments ?? {} },
  });
  if (!rpc.ok) {
    await persistOutboundAudit(
      {
        jsonRpcId,
        toolName: input.toolName,
        arguments: input.arguments ?? {},
        startedAtMs,
        outcome: 'execution_error',
        error: { message: rpc.message ?? rpc.reason },
      },
      input.agentRunId,
    );
    return { ok: false, reason: rpc.reason, ...(rpc.message ? { message: rpc.message } : {}) };
  }
  const content = (rpc.result as McpToolCallResult | undefined)?.content;
  if (!Array.isArray(content)) {
    return { ok: false, reason: 'invalid_response', message: 'Missing tools/call content' };
  }
  const result = rpc.result as McpToolCallResult;
  await persistOutboundAudit(
    {
      jsonRpcId,
      toolName: input.toolName,
      arguments: input.arguments ?? {},
      startedAtMs,
      outcome: 'success',
      toolResult: result,
    },
    input.agentRunId,
  );
  return { ok: true, origin: listed.origin, result };
}
