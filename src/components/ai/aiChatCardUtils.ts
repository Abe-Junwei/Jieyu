import { createLogger } from '../../observability/logger';

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
  if (decision === 'confirmed') return isZh ? '已确认执行' : 'Confirmed';
  if (decision === 'cancelled') return isZh ? '已取消执行' : 'Cancelled';
  if (decision === 'confirm_failed') return isZh ? '确认后执行失败' : 'Confirm failed';
  return decision || (isZh ? '未知' : 'Unknown');
}

export function formatToolName(isZh: boolean, toolName: string): string {
  const zhMap: Record<string, string> = {
    delete_transcription_segment: '删除句段',
    split_transcription_segment: '切分句段',
    delete_layer: '删除层',
    set_transcription_text: '写入转写',
    set_translation_text: '写入翻译',
    clear_translation_segment: '清空翻译',
    create_transcription_segment: '创建句段',
  };
  const enMap: Record<string, string> = {
    delete_transcription_segment: 'Delete Segment',
    split_transcription_segment: 'Split Segment',
    delete_layer: 'Delete Layer',
    set_transcription_text: 'Set Transcription',
    set_translation_text: 'Set Translation',
    clear_translation_segment: 'Clear Translation',
    create_transcription_segment: 'Create Segment',
  };
  const map = isZh ? zhMap : enMap;
  return map[toolName] ?? toolName;
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
  if (call.name === 'delete_transcription_segment') {
    const utteranceId = typeof call.arguments.utteranceId === 'string' ? call.arguments.utteranceId.trim() : '';
    if (!utteranceId) return isZh ? '当前选中句段' : 'Current selected segment';
    return isZh ? `句段（${compactInternalId(utteranceId)}）` : `Segment (${compactInternalId(utteranceId)})`;
  }

  if (call.name === 'delete_layer') {
    const layerId = typeof call.arguments.layerId === 'string' ? call.arguments.layerId.trim() : '';
    if (layerId) {
      return isZh ? `层（${compactInternalId(layerId)}）` : `Layer (${compactInternalId(layerId)})`;
    }

    const layerType = typeof call.arguments.layerType === 'string' ? call.arguments.layerType.trim() : '';
    const languageQuery = typeof call.arguments.languageQuery === 'string' ? call.arguments.languageQuery.trim() : '';
    if (!layerType && !languageQuery) return null;

    const layerTypeLabel = layerType === 'translation'
      ? (isZh ? '翻译层' : 'Translation layer')
      : layerType === 'transcription'
        ? (isZh ? '转写层' : 'Transcription layer')
        : (isZh ? '目标层' : 'Target layer');

    if (!languageQuery) return layerTypeLabel;
    return isZh ? `${layerTypeLabel}（语言：${languageQuery}）` : `${layerTypeLabel} (language: ${languageQuery})`;
  }

  return null;
}

export function formatPendingConfirmActionLabel(
  isZh: boolean,
  callName: string,
): string {
  const isDeleteAction = callName === 'delete_transcription_segment' || callName === 'delete_layer';
  if (isDeleteAction) return isZh ? '确认删除' : 'Confirm Delete';
  return isZh ? '确认执行' : 'Confirm Action';
}

export function normalizeImpactPreviewLines(
  lines: string[],
  reversible: boolean,
): string[] {
  const irreversiblePattern = /(不可逆|irreversible)/i;
  const reversiblePattern = /(可撤销|可逆|撤销恢复|undo|reversible)/i;

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
  return replayable
    ? (isZh ? '可重放' : 'Replayable')
    : (isZh ? '仅可审计' : 'Audit only');
}

export function formatCitationLabel(
  isZh: boolean,
  citation: { type: 'utterance' | 'note' | 'pdf' | 'schema'; label?: string; refId: string },
): string {
  const fallback = citation.type === 'utterance'
    ? (isZh ? '句段参考' : 'Utterance Ref')
    : citation.type === 'note'
      ? (isZh ? '笔记参考' : 'Note Ref')
      : citation.type === 'pdf'
        ? (isZh ? '文档参考' : 'Document Ref')
        : (isZh ? '参考' : 'Reference');

  const raw = (citation.label ?? '').trim();
  if (!raw) return fallback;

  const legacyIdLike = /^(utt:|note:|pdf:|utt_|note_|pdf_)/i;
  if (legacyIdLike.test(raw)) return fallback;

  return raw;
}
