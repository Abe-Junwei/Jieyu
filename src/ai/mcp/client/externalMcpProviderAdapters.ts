/**
 * B15 — Zotero / OpenAlex HTTP MCP adapters.
 * Maps known tools/call text payloads to EvidencePacketV0. Does not spawn stdio or call REST APIs.
 */

import { buildEvidencePacketV0, type EvidencePacketV0 } from '../../vertical/evidencePacket';
import type { McpClientProvider } from './mcpClientTypes';
import type { McpToolCallResult } from '../server/types';

export const ZOTERO_MCP_HTTP_DEFAULT_ORIGIN = 'http://127.0.0.1:8765/mcp';
export const OPENALEX_MCP_ORIGIN_PLACEHOLDER = 'https://mcp.example.test/openalex';

const PACKET_CAP = 8;

const ZOTERO_TOOL_NAMES = new Set([
  'zotero_search_items',
  'zotero_item_fulltext',
  'zotero_get_item',
  'search_items',
  'item_fulltext',
]);

const OPENALEX_TOOL_NAMES = new Set([
  'search_works',
  'get_work',
  'get_work_details',
  'openalex_search_works',
  'openalex_get_work',
  'openalex_search_entities',
]);

export type ExternalMcpProviderPreset = {
  provider: McpClientProvider;
  originDraft: string;
  labelDraft: string;
};

export const EXTERNAL_MCP_PROVIDER_PRESETS: readonly ExternalMcpProviderPreset[] = [
  {
    provider: 'zotero',
    originDraft: ZOTERO_MCP_HTTP_DEFAULT_ORIGIN,
    labelDraft: 'Zotero',
  },
  {
    provider: 'openalex',
    originDraft: OPENALEX_MCP_ORIGIN_PLACEHOLDER,
    labelDraft: 'OpenAlex',
  },
];

export function resolveExternalMcpProviderFromToolName(toolName: string): McpClientProvider | null {
  const name = toolName.trim();
  if (!name) return null;
  if (name.startsWith('zotero_') || ZOTERO_TOOL_NAMES.has(name)) return 'zotero';
  if (name.startsWith('openalex_') || OPENALEX_TOOL_NAMES.has(name)) return 'openalex';
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function unwrapItemList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  if (!record) return parsed ? [parsed] : [];
  for (const key of ['results', 'works', 'items', 'data', 'matches']) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
  }
  return [record];
}

function parseJsonish(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectTextPayloads(content: McpToolCallResult['content']): string[] {
  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text);
}

function itemToPacket(
  provider: McpClientProvider,
  item: unknown,
  index: number,
): EvidencePacketV0 | null {
  const record = asRecord(item);
  if (!record) return null;
  const sourceId = readString(record, ['doi', 'DOI', 'id', 'key', 'openalex_id']);
  const title = readString(record, ['display_name', 'title', 'citation', 'name']);
  if (!sourceId && !title) return null;
  const resolvedId = (sourceId ?? `${provider}_${index + 1}`).slice(0, 128);
  const yearRaw = record.publication_year ?? record.year;
  const year = typeof yearRaw === 'number' ? String(yearRaw) : readString(record, ['date']);
  try {
    return buildEvidencePacketV0({
      id: `ev_mcp_${provider}_${resolvedId}`.slice(0, 128),
      sourceType: 'document',
      sourceId: resolvedId,
      ...(title ? { quote: title.slice(0, 500) } : {}),
      ...(year ? { summary: year } : {}),
      reasonCode: `external_mcp_${provider}`,
    });
  } catch {
    return null;
  }
}

export function mapExternalMcpToolResultToEvidencePackets(input: {
  toolName: string;
  content: McpToolCallResult['content'];
}): EvidencePacketV0[] {
  const provider = resolveExternalMcpProviderFromToolName(input.toolName);
  if (!provider) return [];
  const packets: EvidencePacketV0[] = [];
  for (const text of collectTextPayloads(input.content)) {
    const parsed = parseJsonish(text);
    const items = parsed === null ? [] : unwrapItemList(parsed);
    for (const item of items) {
      const packet = itemToPacket(provider, item, packets.length);
      if (packet) packets.push(packet);
      if (packets.length >= PACKET_CAP) return packets;
    }
  }
  return packets;
}
