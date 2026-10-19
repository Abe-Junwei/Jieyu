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
      /** The first call that needs user input. It is left out of finalContent. */
      inputCard?: { name: string; form: ExternalMcpInputCard };
    };

/** OpenAI-compatible function names: `^[a-zA-Z0-9_-]{1,64}$`. */
const TOOL_NAME_MAX = 64;
const TOOL_NAME_HASH_LENGTH = 8;
const TOOL_NAME_TOOL_PART_MAX = 24;

function stableNameHash(text: string): string {
  // FNV-1a 32-bit; stable across sessions so cached names and audit rows line up.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(TOOL_NAME_HASH_LENGTH, '0');
}

const nameSlug = (text: string) => text.replace(/[^a-zA-Z0-9_]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Readable but lossy: the hash suffix keeps names unique. Names are mapped back through
 * the exposed-tool list (`listExposedExternalMcpTools`), never parsed.
 */
export function encodeExternalMcpToolName(origin: string, toolName: string): string {
  const hash = stableNameHash(`${origin}\n${toolName}`);
  const budget = TOOL_NAME_MAX - EXTERNAL_MCP_TOOL_NAME_PREFIX.length - hash.length - 2;
  const toolPart = nameSlug(toolName).slice(0, TOOL_NAME_TOOL_PART_MAX);
  const hostPart = nameSlug(origin.replace(/^[a-z]+:\/\//i, '')).slice(
    0,
    Math.max(0, budget - toolPart.length - 1),
  );
  const readable = [hostPart, toolPart].filter(Boolean).join('-');
  return `${EXTERNAL_MCP_TOOL_NAME_PREFIX}${readable}__${hash}`;
}

type ExposedExternalMcpTool = { name: string; origin: string; tool: ExternalMcpToolSchema };

/** Enabled origins' cached tools that pass the schema safety check, with their encoded names. */
async function listExposedExternalMcpTools(): Promise<ExposedExternalMcpTool[]> {
  const out: ExposedExternalMcpTool[] = [];
  for (const entry of await listExternalMcpTrustEntries()) {
    if (!entry.enabled || !entry.lastToolsJson) continue;
    const tools = parseLastToolsJson(entry.lastToolsJson);
    if (tools.length === 0) continue;
    const exposed = await exposeExternalMcpToolsToLlm({ origin: entry.origin, tools });
    if (!exposed.allowed) continue;
    for (const tool of exposed.tools) {
      out.push({
        name: encodeExternalMcpToolName(exposed.origin, tool.name),
        origin: exposed.origin,
        tool,
      });
    }
  }
  return out;
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
  const lines: string[] = [
    'External MCP tools (cached schema; emit tool_call JSON only; prefer local tools when they suffice):',
  ];
  for (const { name, tool } of await listExposedExternalMcpTools()) {
    const desc = tool.description ? `: ${tool.description}` : '';
    lines.push(`- ${name}(arguments:{...})${desc}`);
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
  const exposed = await listExposedExternalMcpTools();
  const resolved: ExternalMcpToolCall[] = [];
  for (const holder of holders) {
    const matches = exposed.filter((item) => item.name === holder.name);
    if (matches.length !== 1) continue;
    resolved.push({
      name: holder.name,
      origin: matches[0]!.origin,
      toolName: matches[0]!.tool.name,
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
  const specs: RuntimeV2ExternalMcpTool[] = [];
  for (const { name, origin, tool } of await listExposedExternalMcpTools()) {
    if (isExternalMcpStdioOrigin(origin) && !featureFlags.corpusExternalEvidenceEnabled) continue;
    if (isExternalMcpSecondModelTool(tool.name)) continue;
    if (resolveExternalEvidenceKind(tool.name) && !featureFlags.corpusExternalEvidenceEnabled) {
      continue;
    }
    const schema =
      tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
        ? (tool.inputSchema as Record<string, unknown>)
        : { type: 'object', properties: {} };
    specs.push({
      name,
      origin,
      toolName: tool.name,
      description: tool.description?.trim() || tool.name,
      inputSchema: schema,
    });
    if (specs.length >= RUNTIME_V2_EXTERNAL_MCP_TOOL_CAP) return specs;
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

export type ExternalMcpInputFormOutcome =
  /** A required field is empty; nothing was sent. */
  | { kind: 'missing_required' }
  /** The server asked again. `form` carries the new requestState. */
  | { kind: 'asked_again'; form: ExternalMcpInputCard }
  | { kind: 'done' }
  | { kind: 'failed'; reason: string };

/** User submitted the form. */
export async function completeExternalMcpInputForm(
  form: ExternalMcpInputCard,
  values: Record<string, string>,
  agentRunId?: string,
): Promise<ExternalMcpInputFormOutcome> {
  const inputResponses = buildExternalMcpInputResponses(form, values);
  if (!inputResponses) return { kind: 'missing_required' };
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
  if (payload.form) return { kind: 'asked_again', form: payload.form };
  if (!payload.ok) return { kind: 'failed', reason: payload.reason ?? 'external mcp tool failed' };
  return { kind: 'done' };
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
  let inputCard: { name: string; form: ExternalMcpInputCard } | undefined;
  const collectedPackets: EvidencePacketV0[] = [];
  for (const call of calls) {
    const payload = await executeExternalMcpCall(call, input.agentRunId);
    collectedPackets.push(...(payload.evidencePackets ?? []));
    if (payload.form && !inputCard) {
      inputCard = { name: call.name, form: payload.form };
      continue;
    }
    if (!payload.ok) anyError = true;
    payloads.push(modelSafePayload(payload));
  }
  const finalContent = payloads.length > 0 ? externalMcpResultsBody(payloads) : '';
  const extras = {
    ...(collectedPackets.length > 0 ? { evidencePackets: collectedPackets } : {}),
    ...(inputCard ? { inputCard } : {}),
  };
  if (anyError) {
    return {
      handled: true,
      finalContent,
      finalStatus: 'error',
      finalErrorMessage: 'external mcp tool failed',
      ...extras,
    };
  }
  return { handled: true, finalContent, finalStatus: 'done', ...extras };
}

/** finalContent goes to history and back to the model: no form, server question or requestState. */
function modelSafePayload(payload: ExternalMcpCallPayload): ExternalMcpCallPayload {
  if (payload.reason !== 'input_required') return payload;
  return { name: payload.name, ok: false, reason: 'input_required' };
}
