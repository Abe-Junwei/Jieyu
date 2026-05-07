/**
 * P1 — Single structural contract for aligning assistant citations, evidence packets,
 * and (future) tool-decision audit source pointers. Citations use `type`+`refId`;
 * evidence packets use `sourceType`+`sourceId`.
 */

import type { AiMessageCitation } from '../../db/types';
import type { EvidencePacketSourceType } from './evidencePacket';

export type EvidenceSourceRefV1 =
  | { channel: 'citation'; type: AiMessageCitation['type']; refId: string }
  | { channel: 'evidence_packet'; sourceType: EvidencePacketSourceType; sourceId: string };

export function evidenceSourceRefFromCitation(c: Pick<AiMessageCitation, 'type' | 'refId'>): EvidenceSourceRefV1 {
  return { channel: 'citation', type: c.type, refId: c.refId };
}

export function evidenceSourceRefFromEvidencePacket(p: {
  sourceType: EvidencePacketSourceType;
  sourceId: string;
}): EvidenceSourceRefV1 {
  return { channel: 'evidence_packet', sourceType: p.sourceType, sourceId: p.sourceId };
}

/** Stable string for audit joins / dedupe keys (not user-visible). */
export function formatEvidenceSourceRefForAudit(ref: EvidenceSourceRefV1): string {
  if (ref.channel === 'citation') {
    return `citation:${ref.type}:${ref.refId}`;
  }
  return `evidence_packet:${ref.sourceType}:${ref.sourceId}`;
}

const PROPOSE_CHANGES_NEST_MAX_DEPTH = 6;

function collectEvidenceSourceRefsFromArgs(
  toolName: string,
  args: Record<string, unknown>,
  depth: number,
  out: EvidenceSourceRefV1[],
): void {
  if (depth > PROPOSE_CHANGES_NEST_MAX_DEPTH) {
    return;
  }

  const pushSegment = (raw: string) => {
    const id = raw.trim();
    if (id.length > 0) {
      out.push(evidenceSourceRefFromEvidencePacket({ sourceType: 'segment', sourceId: id }));
    }
  };

  if (typeof args.segmentId === 'string') {
    pushSegment(args.segmentId);
  }
  const segmentIds = args.segmentIds;
  if (Array.isArray(segmentIds)) {
    for (const item of segmentIds) {
      if (typeof item === 'string') {
        pushSegment(item);
      }
    }
  }

  if (typeof args.unitId === 'string' && args.unitId.trim().length > 0) {
    out.push(evidenceSourceRefFromEvidencePacket({
      sourceType: 'lexeme',
      sourceId: args.unitId.trim(),
    }));
  }

  for (const key of ['layerId', 'translationLayerId', 'transcriptionLayerId'] as const) {
    const v = args[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      out.push(evidenceSourceRefFromEvidencePacket({
        sourceType: 'layer_text',
        sourceId: v.trim(),
      }));
    }
  }

  const normalized = toolName.replace(/-/g, '_').toLowerCase();
  if (normalized !== 'propose_changes' || !Array.isArray(args.changes)) {
    return;
  }

  for (const row of args.changes) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const change = row as Record<string, unknown>;
    const innerName = (typeof change.tool === 'string' && change.tool.trim().length > 0
      ? change.tool.trim()
      : (typeof change.name === 'string' && change.name.trim().length > 0 ? change.name.trim() : 'unknown_nested_tool'));
    const innerArgs = change.arguments;
    if (innerArgs && typeof innerArgs === 'object' && !Array.isArray(innerArgs)) {
      collectEvidenceSourceRefsFromArgs(innerName, innerArgs as Record<string, unknown>, depth + 1, out);
    }
  }
}

/**
 * Best-effort structural source pointers for tool-decision audit metadata (`evidenceSourceRefs`).
 * Uses the same `formatEvidenceSourceRefForAudit` strings as citations / evidence packets.
 */
export function evidenceSourceRefsFromToolCallForAudit(toolCall: {
  name: string;
  arguments: Record<string, unknown>;
}): string[] {
  const args = toolCall.arguments && typeof toolCall.arguments === 'object' && !Array.isArray(toolCall.arguments)
    ? toolCall.arguments
    : {};
  const refs: EvidenceSourceRefV1[] = [];
  collectEvidenceSourceRefsFromArgs(toolCall.name, args, 0, refs);
  const formatted = refs.map(formatEvidenceSourceRefForAudit);
  return [...new Set(formatted)];
}
