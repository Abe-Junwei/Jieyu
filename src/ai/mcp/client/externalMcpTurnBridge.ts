/**
 * B14 — send-turn bridge for cached outbound MCP tools.
 * Adapts Claude-style `mcp__server__tool` to `extmcp__<originKey>__<tool>`.
 * Does not register names on AI_TOOL_CATALOG. Guide is Dexie-only; HTTP only on execute.
 */

import { extractJsonCandidates } from '../../chat/toolCallSchemas';
import { featureFlags } from '../../config/featureFlags';
import { callExternalMcpToolViaHttp } from './externalMcpHttpClient';
import {
  exposeExternalMcpToolsToLlm,
  listExternalMcpTrustEntries,
  type ExternalMcpToolSchema,
} from './externalMcpTrustRegistry';

export const EXTERNAL_MCP_TOOL_NAME_PREFIX = 'extmcp__';
const GUIDE_MAX_CHARS = 4_000;
const RESULT_MAX_CHARS = 8_000;
const MAX_CALLS_PER_TURN = 5;

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
    };

export function encodeExternalMcpToolName(origin: string, toolName: string): string {
  const originKey = origin.replace(/[^a-zA-Z0-9.-]/g, '_');
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
  const payloads: unknown[] = [];
  let anyError = false;
  for (const call of calls) {
    const result = await callExternalMcpToolViaHttp({
      origin: call.origin,
      toolName: call.toolName,
      arguments: call.arguments,
      ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    });
    if (!result.ok) anyError = true;
    payloads.push(
      result.ok
        ? { name: call.name, ok: true, origin: result.origin, content: result.result.content }
        : {
            name: call.name,
            ok: false,
            reason: result.reason,
            ...(result.message ? { message: result.message } : {}),
          },
    );
  }
  const finalContent = JSON.stringify({ external_mcp_tool_results: payloads }).slice(
    0,
    RESULT_MAX_CHARS,
  );
  if (anyError) {
    return {
      handled: true,
      finalContent,
      finalStatus: 'error',
      finalErrorMessage: 'external mcp tool failed',
    };
  }
  return { handled: true, finalContent, finalStatus: 'done' };
}
