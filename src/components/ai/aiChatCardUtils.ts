import { createLogger } from '../../observability/logger';
import { getAiChatCardUtilityMessages } from '../../i18n/aiChatCardUtilityMessages';

const log = createLogger('AiChatCardUtils');

export interface PromptTemplateItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const PROMPT_TEMPLATES_STORAGE_KEY = 'jieyu.ai.promptTemplates.v1';

export function loadPromptTemplatesFromStorage(): PromptTemplateItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromptTemplateItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.id === 'string' && typeof item?.title === 'string' && typeof item?.content === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    log.warn('Failed to load prompt templates from localStorage', {
      storageKey: PROMPT_TEMPLATES_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function newTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function interpolatePromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return vars[key] ?? '';
  });
}

export function formatToolDecision(isZh: boolean, decision: string): string {
  const messages = getAiChatCardUtilityMessages(isZh);
  if (decision === 'confirmed') return messages.confirmed;
  if (decision === 'cancelled') return messages.cancelled;
  if (decision === 'confirm_failed') return messages.confirmFailed;
  return decision || messages.unknown;
}

export function formatToolName(isZh: boolean, toolName: string): string {
  return getAiChatCardUtilityMessages(isZh).toolNames[toolName] ?? toolName;
}

export function compactInternalId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function formatPendingTarget(
  isZh: boolean,
  call: { name: string; arguments: Record<string, unknown> },
): string | null {
  const messages = getAiChatCardUtilityMessages(isZh);
  if (call.name === 'delete_transcription_segment') {
    if (call.arguments.allSegments === true) return messages.allSegments;

    const segmentIndex = call.arguments.segmentIndex;
    if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
      return messages.indexedSegment(segmentIndex);
    }
    if (call.arguments.segmentPosition === 'last') {
      return messages.lastSegment;
    }
    if (call.arguments.segmentPosition === 'previous') {
      return messages.previousSegment;
    }
    if (call.arguments.segmentPosition === 'next') {
      return messages.nextSegment;
    }
    if (call.arguments.segmentPosition === 'penultimate') {
      return messages.penultimateSegment;
    }
    if (call.arguments.segmentPosition === 'middle') {
      return messages.middleSegment;
    }

    const segmentIds = Array.isArray(call.arguments.segmentIds)
      ? call.arguments.segmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const utteranceIds = Array.isArray(call.arguments.utteranceIds)
      ? call.arguments.utteranceIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const batchCount = segmentIds.length + utteranceIds.length;
    if (batchCount > 1) return messages.selectedSegments(batchCount);

    const segmentId = typeof call.arguments.segmentId === 'string' ? call.arguments.segmentId.trim() : '';
    if (segmentId) return messages.segmentWithId(compactInternalId(segmentId));

    const utteranceId = typeof call.arguments.utteranceId === 'string' ? call.arguments.utteranceId.trim() : '';
    if (!utteranceId) return messages.currentSelectedSegment;
    return messages.segmentWithId(compactInternalId(utteranceId));
  }

  if (call.name === 'delete_layer') {
    const layerId = typeof call.arguments.layerId === 'string' ? call.arguments.layerId.trim() : '';
    if (layerId) {
      return messages.layerWithId(compactInternalId(layerId));
    }

    const layerType = typeof call.arguments.layerType === 'string' ? call.arguments.layerType.trim() : '';
    const languageQuery = typeof call.arguments.languageQuery === 'string' ? call.arguments.languageQuery.trim() : '';
    if (!layerType && !languageQuery) return null;

    const layerTypeLabel = layerType === 'translation'
      ? messages.translationLayer
      : layerType === 'transcription'
        ? messages.transcriptionLayer
        : messages.targetLayer;

    if (!languageQuery) return layerTypeLabel;
    return messages.layerLanguage(layerTypeLabel, languageQuery);
  }

  return null;
}

export function formatPendingConfirmActionLabel(
  isZh: boolean,
  callName: string,
): string {
  const isDeleteAction = callName === 'delete_transcription_segment' || callName === 'delete_layer';
  const messages = getAiChatCardUtilityMessages(isZh);
  if (isDeleteAction) return messages.confirmDelete;
  return messages.confirmAction;
}

export function normalizeImpactPreviewLines(
  lines: string[],
  reversible: boolean,
): string[] {
  const messages = getAiChatCardUtilityMessages(true);
  const irreversiblePattern = new RegExp(`(${messages.irreversiblePatternSource})`, 'i');
  const reversiblePattern = new RegExp(`(${messages.reversiblePatternSource})`, 'i');

  return lines.filter((line) => {
    if (reversible) return !irreversiblePattern.test(line);
    return !reversiblePattern.test(line);
  });
}

function sanitizeSnapshotFileName(raw: string): string {
  return raw.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'snapshot';
}

export function buildSnapshotDownloadName(toolName: string, requestId: string): string {
  return `ai-tool-golden-${sanitizeSnapshotFileName(toolName)}-${requestId}.json`;
}

export function formatReplayableLabel(isZh: boolean, replayable: boolean): string {
  const messages = getAiChatCardUtilityMessages(isZh);
  return replayable
    ? messages.replayable
    : messages.auditOnly;
}

export function formatCitationLabel(
  isZh: boolean,
  citation: { type: 'utterance' | 'note' | 'pdf' | 'schema'; label?: string; refId: string; readModelIndexHit?: boolean },
): string {
  const messages = getAiChatCardUtilityMessages(isZh);
  const fallback = citation.type === 'utterance'
    ? messages.timelineUnitRef
    : citation.type === 'note'
      ? messages.noteRef
      : citation.type === 'pdf'
        ? messages.documentRef
        : messages.reference;

  const raw = (citation.label ?? '').trim();
  const legacyIdLike = /^(utt:|note:|pdf:|utt_|note_|pdf_)/i;
  const base = !raw || legacyIdLike.test(raw) ? fallback : raw;
  if (citation.readModelIndexHit === false) {
    return `${base}${messages.citationReadModelMissSuffix}`;
  }
  return base;
}
