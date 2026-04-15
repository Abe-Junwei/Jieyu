import type { AiChatToolCall, PendingAiToolCall } from '../chat/chatDomain.types';

export interface AiChangeSetItem {
  unitId: string;
  field: string;
  before: string;
  after: string;
}

export interface AiChangeSet {
  id: string;
  description: string;
  sourceEpoch?: number;
  changes: AiChangeSetItem[];
}

function newChangeSetId(): string {
  return `changeset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractPrimaryUnitIdFromToolArgs(call: AiChatToolCall): string | null {
  const a = call.arguments;
  const segmentId = typeof a.segmentId === 'string' ? a.segmentId.trim() : '';
  if (segmentId.length > 0) return segmentId;
  const utteranceId = typeof a.utteranceId === 'string' ? a.utteranceId.trim() : '';
  if (utteranceId.length > 0) return utteranceId;
  const layerId = typeof a.layerId === 'string' ? a.layerId.trim() : '';
  if (layerId.length > 0) return layerId;
  const tokenId = typeof a.tokenId === 'string' ? a.tokenId.trim() : '';
  if (tokenId.length > 0) return tokenId;
  return null;
}

function summarizeToolArgsForPreview(args: Record<string, unknown>): string {
  const text = typeof args.text === 'string' ? args.text : '';
  if (text.length > 0) {
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  const query = typeof args.query === 'string' ? args.query : '';
  if (query.length > 0) {
    return query.length > 80 ? `${query.slice(0, 80)}…` : query;
  }
  try {
    const s = JSON.stringify(args);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return '(args)';
  }
}

export function buildAiChangeSetFromPendingToolCall(pending: PendingAiToolCall): AiChangeSet {
  if (pending.call.name === 'propose_changes' && pending.proposedChildCalls && pending.proposedChildCalls.length > 0) {
    const args = pending.call.arguments;
    const descFromArgs = typeof args.description === 'string' ? args.description.trim() : '';
    const description = descFromArgs.length > 0 ? descFromArgs : (pending.riskSummary ?? pending.call.name);
    const sourceEpochFromArgs = typeof args.sourceEpoch === 'number' && Number.isInteger(args.sourceEpoch) && args.sourceEpoch >= 0
      ? args.sourceEpoch
      : pending.readModelEpochCaptured;

    const changes: AiChangeSetItem[] = pending.proposedChildCalls.map((child, index) => ({
      unitId: extractPrimaryUnitIdFromToolArgs(child) ?? `step-${index + 1}`,
      field: child.name,
      before: '',
      after: summarizeToolArgsForPreview(child.arguments),
    }));

    return {
      id: newChangeSetId(),
      description,
      ...(sourceEpochFromArgs !== undefined ? { sourceEpoch: sourceEpochFromArgs } : {}),
      changes,
    };
  }

  const affectedIds = pending.previewContract?.affectedIds ?? [];
  const changes = affectedIds.length > 0
    ? affectedIds.map((id) => ({
      unitId: id,
      field: 'pending_tool_call',
      before: '',
      after: pending.call.name,
    }))
    : [{
      unitId: '__scope__',
      field: 'pending_tool_call',
      before: '',
      after: pending.call.name,
    }];
  return {
    id: newChangeSetId(),
    description: pending.riskSummary ?? pending.call.name,
    ...(pending.readModelEpochCaptured !== undefined ? { sourceEpoch: pending.readModelEpochCaptured } : {}),
    changes,
  };
}

export function validateChangeSetEpoch(changeSet: AiChangeSet, currentEpoch?: number): boolean {
  if (currentEpoch === undefined) return true;
  if (changeSet.sourceEpoch === undefined) return false;
  return changeSet.sourceEpoch === currentEpoch;
}
