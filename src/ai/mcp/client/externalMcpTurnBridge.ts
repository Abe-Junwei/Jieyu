/**
 * B14 — send-turn bridge for cached outbound MCP tools.
 * Adapts Claude-style `mcp__server__tool` to `extmcp__<originKey>__<tool>`.
 * Does not register names on AI_TOOL_CATALOG. Guide is Dexie-only; HTTP only on execute.
 */

import { extractJsonCandidates } from '../../chat/toolCallSchemas';
import { featureFlags } from '../../config/featureFlags';
import { callExternalMcpToolViaHttp } from './externalMcpHttpClient';
import { mapExternalMcpToolResultToEvidencePackets } from './externalMcpProviderAdapters';
import { callLocalMcpToolViaStdio, isExternalMcpStdioOrigin } from './externalMcpStdioClient';
import {
  isExternalMcpSecondModelTool,
  resolveExternalEvidenceKind,
} from './externalMcpEvidenceHits';
import {
  exposeExternalMcpToolsToLlm,
  listExternalMcpTrustEntries,
  type ExternalMcpToolSchema,
} from './externalMcpTrustRegistry';
import type { EvidencePacketV0 } from '../../vertical/evidencePacket';
import { inspectInbound } from '../../security/semanticGuard';
import {
  buildExternalMcpInputResponses,
  parseExternalMcpInputRequired,
  type ExternalMcpInputCard,
  type ExternalMcpInputForm,
} from './externalMcpInputRequired';

export const EXTERNAL_MCP_TOOL_NAME_PREFIX = 'extmcp__';
const GUIDE_MAX_CHARS = 4_000;
const RESULT_MAX_CHARS = 8_000;
const MODEL_CONTENT_MAX_CHARS = 4_000;
const MAX_CALLS_PER_TURN = 5;
export const RUNTIME_V2_EXTERNAL_MCP_TOOL_CAP = 5;

export type ExternalMcpCallPayload = {
  name: string;
  ok: boolean;
  origin?: string;
  content?: unknown;
  evidencePackets?: EvidencePacketV0[];
  reason?: string;
  message?: string;
  form?: ExternalMcpInputCard;
};

export type ExternalMcpToolCall = {
  name: string;
  origin: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type ExternalMcpSendTurnResolution =
  | { handled: false }
  | {
      handled: true;
      finalContent: string;
      finalStatus: 'done' | 'error';
      finalErrorMessage?: string;
      evidencePackets?: EvidencePacketV0[];
    };

export function encodeExternalMcpToolName(origin: string, toolName: string): string {
  // Origin keys must not contain `__` (the name separator). `://` would become `___`
  // if replaced with `_`, so illegal characters become `-`.
  const originKey = origin.replace(/[^a-zA-Z0-9.-]/g, '-');
  return `${EXTERNAL_MCP_TOOL_NAME_PREFIX}${originKey}__${toolName}`;
}

export function decodeExternalMcpToolName(
  encoded: string,
): { originKey: string; toolName: string } | null {
  if (!encoded.startsWith(EXTERNAL_MCP_TOOL_NAME_PREFIX)) return null;
  const rest = encoded.slice(EXTERNAL_MCP_TOOL_NAME_PREFIX.length);
  const sep = rest.indexOf('__');
  if (sep <= 0) return null;
  const originKey = rest.slice(0, sep);
  const toolName = rest.slice(sep + 2);
  if (!originKey || !toolName) return null;
  return { originKey, toolName };
}

function rawContentPassesInbound(content: ReadonlyArray<{ type: string; text?: string }>): boolean {
  const texts = content.flatMap((part) =>
    part.type === 'text' && typeof part.text === 'string' ? [part.text] : [],
  );
  return (
    inspectInbound({ text: texts.join('\n'), snippets: texts, trustTier: 'untrusted' }).action ===
    'allow'
  );
}

function parseLastToolsJson(raw: string | undefined): ExternalMcpToolSchema[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        name: String(item.name ?? ''),
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
        ...(item.inputSchema && typeof item.inputSchema === 'object'
          ? { inputSchema: item.inputSchema }
          : {}),
      }))
      .filter((tool) => tool.name.trim().length > 0);
  } catch {
    return [];
  }
}

function extractNamedToolHolders(
  rawText: string,
): Array<{ name: string; arguments: Record<string, unknown> }> {
  const out: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for (const candidate of extractJsonCandidates(rawText)) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const batch = parsed.tool_calls;
      if (Array.isArray(batch)) {
        for (const item of batch) {
          if (!item || typeof item !== 'object') continue;
          const holder = item as Record<string, unknown>;
          if (typeof holder.name !== 'string') continue;
          const rawArgs = holder.arguments;
          const args =
            typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
              ? (rawArgs as Record<string, unknown>)
              : {};
          out.push({ name: holder.name, arguments: args });
        }
        continue;
      }
      const holder =
        typeof parsed.tool_call === 'object' && parsed.tool_call !== null
          ? (parsed.tool_call as Record<string, unknown>)
          : parsed;
      if (typeof holder.name !== 'string') continue;
      const rawArgs = holder.arguments;
      const args =
        typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
          ? (rawArgs as Record<string, unknown>)
          : {};
      out.push({ name: holder.name, arguments: args });
    } catch {
      continue;
    }
  }
  return out;
}

export async function buildExternalMcpToolCallGuide(): Promise<string> {
  if (!featureFlags.aiExternalMcpSendTurnEnabled) return '';
  if (!featureFlags.aiExternalMcpTrustEnabled) return '';
  const entries = await listExternalMcpTrustEntries();
  const lines: string[] = [
    'External MCP tools (cached schema; emit tool_call JSON only; prefer local tools when they suffice):',
  ];
  for (const entry of entries) {
    if (!entry.enabled || !entry.lastToolsJson) continue;
    const tools = parseLastToolsJson(entry.lastToolsJson);
    if (tools.length === 0) continue;
    const exposed = await exposeExternalMcpToolsToLlm({ origin: entry.origin, tools });
    if (!exposed.allowed) continue;
    for (const tool of exposed.tools) {
      const encoded = encodeExternalMcpToolName(exposed.origin, tool.name);
      const desc = tool.description ? `: ${tool.description}` : '';
      lines.push(`- ${encoded}(arguments:{...})${desc}`);
    }
  }
  if (lines.length === 1) return '';
  lines.push('Do not paste these identifiers into natural-language replies to the user.');
  return lines.join('\n').slice(0, GUIDE_MAX_CHARS);
}

export async function parseExternalMcpToolCallsFromText(
  rawText: string,
): Promise<ExternalMcpToolCall[]> {
  if (!featureFlags.aiExternalMcpSendTurnEnabled) return [];
  const holders = extractNamedToolHolders(rawText).filter((item) =>
    item.name.startsWith(EXTERNAL_MCP_TOOL_NAME_PREFIX),
  );
  if (holders.length === 0) return [];
  const enabled = (await listExternalMcpTrustEntries()).filter((entry) => entry.enabled);
  const resolved: ExternalMcpToolCall[] = [];
  for (const holder of holders) {
    const decoded = decodeExternalMcpToolName(holder.name);
    if (!decoded) continue;
    const matches = enabled.filter(
      (entry) => encodeExternalMcpToolName(entry.origin, decoded.toolName) === holder.name,
    );
    if (matches.length !== 1) continue;
    resolved.push({
      name: holder.name,
      origin: matches[0]!.origin,
      toolName: decoded.toolName,
      arguments: holder.arguments,
    });
  }
  return resolved;
}

/** Cached tools for ToolLoopAgent. At most 5. Second-model tools are left out. */
export type RuntimeV2ExternalMcpTool = {
  name: string;
  origin: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export async function listRuntimeV2ExternalMcpTools(): Promise<RuntimeV2ExternalMcpTool[]> {
  if (!featureFlags.aiExternalMcpSendTurnEnabled || !featureFlags.aiExternalMcpTrustEnabled) {
    return [];
  }
  const entries = await listExternalMcpTrustEntries();
  const specs: RuntimeV2ExternalMcpTool[] = [];
  for (const entry of entries) {
    if (!entry.enabled || !entry.lastToolsJson) continue;
    if (isExternalMcpStdioOrigin(entry.origin) && !featureFlags.corpusExternalEvidenceEnabled) {
      continue;
    }
    for (const tool of parseLastToolsJson(entry.lastToolsJson)) {
      if (isExternalMcpSecondModelTool(tool.name)) continue;
      if (resolveExternalEvidenceKind(tool.name) && !featureFlags.corpusExternalEvidenceEnabled) {
        continue;
      }
      const schema =
        tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: 'object', properties: {} };
      specs.push({
        name: encodeExternalMcpToolName(entry.origin, tool.name),
        origin: entry.origin,
        toolName: tool.name,
        description: tool.description?.trim() || tool.name,
        inputSchema: schema,
      });
      if (specs.length >= RUNTIME_V2_EXTERNAL_MCP_TOOL_CAP) return specs;
    }
  }
  return specs;
}

function inputCard(
  call: ExternalMcpToolCall,
  form: ExternalMcpInputForm,
): ExternalMcpInputCard | undefined {
  if (isExternalMcpStdioOrigin(call.origin)) return undefined;
  return {
    origin: call.origin,
    toolName: call.toolName,
    arguments: call.arguments,
    requests: form.requests,
    ...(form.requestState ? { requestState: form.requestState } : {}),
  };
}

/** User submitted the form. A second input_required is not turned into another card. */
export async function completeExternalMcpInputForm(
  form: ExternalMcpInputCard,
  values: Record<string, string>,
  agentRunId?: string,
): Promise<{ ok: boolean; text: string }> {
  const inputResponses = buildExternalMcpInputResponses(form, values);
  if (!inputResponses) return { ok: false, text: 'input_required' };
  const payload = await executeExternalMcpCall(
    {
      name: encodeExternalMcpToolName(form.origin, form.toolName),
      origin: form.origin,
      toolName: form.toolName,
      arguments: form.arguments,
    },
    agentRunId,
    { inputResponses, ...(form.requestState ? { requestState: form.requestState } : {}) },
  );
  return { ok: payload.ok, text: externalMcpModelMessage(payload) };
}

export async function executeExternalMcpCall(
  call: ExternalMcpToolCall,
  agentRunId?: string,
  retry?: { inputResponses: Record<string, unknown>; requestState?: string },
): Promise<ExternalMcpCallPayload> {
  if (isExternalMcpSecondModelTool(call.toolName)) {
    return { name: call.name, ok: false, reason: 'second_model_tool_denied' };
  }
  const evidenceKind = resolveExternalEvidenceKind(call.toolName);
  if (
    (evidenceKind || isExternalMcpStdioOrigin(call.origin)) &&
    !featureFlags.corpusExternalEvidenceEnabled
  ) {
    return { name: call.name, ok: false, reason: 'flag_off' };
  }
  const result = isExternalMcpStdioOrigin(call.origin)
    ? await callLocalMcpToolViaStdio({
        origin: call.origin,
        toolName: call.toolName,
        arguments: call.arguments,
      })
    : await callExternalMcpToolViaHttp({
        origin: call.origin,
        toolName: call.toolName,
        arguments: call.arguments,
        ...(agentRunId ? { agentRunId } : {}),
        ...(retry?.inputResponses ? { inputResponses: retry.inputResponses } : {}),
        ...(retry?.requestState ? { requestState: retry.requestState } : {}),
      });
  if (!result.ok) {
    const form =
      result.reason === 'input_required' && 'form' in result && result.form
        ? inputCard(call, result.form)
        : undefined;
    return {
      name: call.name,
      ok: false,
      reason: result.reason,
      ...('message' in result && result.message ? { message: result.message } : {}),
      ...(form ? { form } : {}),
    };
  }
  const parsedInput = parseExternalMcpInputRequired(result.result);
  if (parsedInput) {
    const form = inputCard(call, parsedInput);
    return {
      name: call.name,
      ok: false,
      reason: 'input_required',
      ...(form ? { form } : {}),
    };
  }
  const evidencePackets = featureFlags.aiExternalMcpProviderAdaptersEnabled
    ? mapExternalMcpToolResultToEvidencePackets({
        toolName: call.toolName,
        content: result.result.content,
      })
    : [];
  if (!evidenceKind && !rawContentPassesInbound(result.result.content)) {
    return { name: call.name, ok: false, reason: 'inbound_blocked' };
  }
  return {
    name: call.name,
    ok: true,
    origin: result.origin,
    ...(evidenceKind ? {} : { content: result.result.content }),
    ...(evidencePackets.length > 0 ? { evidencePackets } : {}),
  };
}

/** What the model may read. Evidence tools contribute packet ids, never the raw payload. */
export function externalMcpModelMessage(payload: ExternalMcpCallPayload): string {
  if (!payload.ok) return payload.reason ?? 'external mcp tool failed';
  if (payload.evidencePackets && payload.evidencePackets.length > 0) {
    return JSON.stringify(
      payload.evidencePackets.map((packet) => ({
        id: packet.id,
        title: packet.title,
        page: packet.page,
        url: packet.url,
        quote: packet.quote,
      })),
    );
  }
  if (payload.content !== undefined) return externalMcpContentMessage(payload.content);
  return 'ok';
}

function externalMcpContentMessage(content: unknown): string {
  const body = JSON.stringify(content);
  if (body === undefined) return 'ok';
  if (body.length <= MODEL_CONTENT_MAX_CHARS) return body;
  return JSON.stringify({ truncated: true });
}

/** Keep whole payloads. Stop before a payload that would exceed RESULT_MAX_CHARS. */
function externalMcpResultsBody(payloads: ExternalMcpCallPayload[]): string {
  const full = JSON.stringify({ external_mcp_tool_results: payloads });
  if (full.length <= RESULT_MAX_CHARS) return full;

  const kept: ExternalMcpCallPayload[] = [];
  for (const payload of payloads) {
    const candidate = JSON.stringify({
      external_mcp_tool_results: [...kept, payload],
      truncated: true,
    });
    if (candidate.length > RESULT_MAX_CHARS) break;
    kept.push(payload);
  }
  return JSON.stringify({ external_mcp_tool_results: kept, truncated: true });
}

export async function resolveExternalMcpSendTurn(input: {
  assistantContent: string;
  canApplySideEffects: boolean;
  agentRunId?: string;
}): Promise<ExternalMcpSendTurnResolution> {
  if (!featureFlags.aiExternalMcpSendTurnEnabled) return { handled: false };
  const holders = extractNamedToolHolders(input.assistantContent).filter((item) =>
    item.name.startsWith(EXTERNAL_MCP_TOOL_NAME_PREFIX),
  );
  if (holders.length === 0) return { handled: false };
  if (!input.canApplySideEffects) {
    return { handled: true, finalContent: input.assistantContent, finalStatus: 'done' };
  }
  const calls = (await parseExternalMcpToolCallsFromText(input.assistantContent)).slice(
    0,
    MAX_CALLS_PER_TURN,
  );
  if (calls.length === 0) {
    return {
      handled: true,
      finalContent: JSON.stringify({
        external_mcp_tool_results: [{ ok: false, reason: 'unresolved_external_mcp_tool' }],
      }),
      finalStatus: 'error',
      finalErrorMessage: 'external mcp tool unresolved',
    };
  }
  const payloads: ExternalMcpCallPayload[] = [];
  let anyError = false;
  const collectedPackets: EvidencePacketV0[] = [];
  for (const call of calls) {
    const payload = await executeExternalMcpCall(call, input.agentRunId);
    if (!payload.ok) anyError = true;
    collectedPackets.push(...(payload.evidencePackets ?? []));
    payloads.push(payload);
  }
  const finalContent = externalMcpResultsBody(payloads);
  if (anyError) {
    return {
      handled: true,
      finalContent,
      finalStatus: 'error',
      finalErrorMessage: 'external mcp tool failed',
      ...(collectedPackets.length > 0 ? { evidencePackets: collectedPackets } : {}),
    };
  }
  return {
    handled: true,
    finalContent,
    finalStatus: 'done',
    ...(collectedPackets.length > 0 ? { evidencePackets: collectedPackets } : {}),
  };
}
