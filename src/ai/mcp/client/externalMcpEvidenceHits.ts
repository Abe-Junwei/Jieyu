/**
 * B17 — map literature / web / corpus-resource MCP hits to EvidencePacketV0.
 * Hits without provenance and passage are dropped. Second-model answer tools are denied.
 */

import { buildEvidencePacketV0, type EvidencePacketV0 } from '../../vertical/evidencePacket';
import { featureFlags } from '../../config/featureFlags';
import { inspectInbound } from '../../security/semanticGuard';
import type { McpToolCallResult } from '../server/types';

const PACKET_CAP = 8;

const LITERATURE_TOOL_NAMES = new Set(['search_literature', 'literature_search', 'search_papers']);

const WEB_TOOL_NAMES = new Set(['web_search', 'search_web', 'search']);

const CORPUS_RESOURCE_TOOL_NAMES = new Set([
  'search_corpus_resource',
  'search_language_resource',
  'corpus_resource_search',
]);

const SECOND_MODEL_TOOL_NAMES = new Set([
  'answer_with_citations',
  'answer_with_citation',
  'rag_answer',
]);

export type ExternalEvidenceKind = 'literature' | 'web' | 'corpus_resource';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function unwrapItemList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  if (!record) return parsed ? [parsed] : [];
  for (const key of ['results', 'hits', 'works', 'items', 'data', 'matches', 'passages']) {
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

export function isExternalMcpSecondModelTool(toolName: string): boolean {
  const name = toolName.trim().toLowerCase();
  if (!name) return false;
  if (SECOND_MODEL_TOOL_NAMES.has(name)) return true;
  return name.includes('answer_with_citation');
}

export function resolveExternalEvidenceKind(toolName: string): ExternalEvidenceKind | null {
  const name = toolName.trim();
  if (!name) return null;
  if (LITERATURE_TOOL_NAMES.has(name) || name.startsWith('literature_')) return 'literature';
  if (WEB_TOOL_NAMES.has(name) || name.startsWith('web_')) return 'web';
  if (CORPUS_RESOURCE_TOOL_NAMES.has(name) || name.startsWith('corpus_resource_')) {
    return 'corpus_resource';
  }
  return null;
}

function passagePassesInbound(passage: string): boolean {
  return (
    inspectInbound({
      text: passage,
      snippets: [passage],
      trustTier: 'untrusted',
    }).action === 'allow'
  );
}

function hitToPacket(
  kind: ExternalEvidenceKind,
  item: unknown,
  index: number,
): EvidencePacketV0 | null {
  const record = asRecord(item);
  if (!record) return null;
  const title = readString(record, ['title', 'work', 'display_name', 'name', 'citation']);
  const page = readString(record, ['page', 'pages', 'page_range', 'pageRange']);
  const url = readString(record, ['url', 'link', 'href', 'doi_url']);
  const passage = readString(record, ['passage', 'quote', 'excerpt', 'snippet', 'text']);
  if (!passage || !title) return null;
  const hasWorkPage = Boolean(page);
  const hasUrlTitle = Boolean(url);
  if (!hasWorkPage && !hasUrlTitle) return null;
  if (!passagePassesInbound(passage)) return null;
  const sourceId =
    readString(record, ['id', 'hitId', 'hit_id', 'doi', 'key']) ?? `${kind}_${index + 1}`;
  try {
    return buildEvidencePacketV0({
      id: `ev_ext_${kind}_${sourceId}`.slice(0, 128),
      sourceType: 'document',
      sourceId: sourceId.slice(0, 128),
      title: title.slice(0, 300),
      quote: passage.slice(0, 800),
      ...(page ? { page: page.slice(0, 64) } : {}),
      ...(url ? { url: url.slice(0, 500) } : {}),
      reasonCode: `external_mcp_${kind}`,
    });
  } catch {
    return null;
  }
}

export function mapExternalEvidenceToolResultToPackets(input: {
  toolName: string;
  content: McpToolCallResult['content'];
}): EvidencePacketV0[] {
  if (!featureFlags.corpusExternalEvidenceEnabled) return [];
  if (isExternalMcpSecondModelTool(input.toolName)) return [];
  const kind = resolveExternalEvidenceKind(input.toolName);
  if (!kind) return [];
  const packets: EvidencePacketV0[] = [];
  for (const text of collectTextPayloads(input.content)) {
    const parsed = parseJsonish(text);
    if (parsed === null) continue;
    for (const item of unwrapItemList(parsed)) {
      const packet = hitToPacket(kind, item, packets.length);
      if (packet) packets.push(packet);
      if (packets.length >= PACKET_CAP) return packets;
    }
  }
  return packets;
}
