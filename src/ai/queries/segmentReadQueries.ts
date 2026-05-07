/**
 * PR-P0-1: 只读查询门面（Segment Read Queries）
 *
 * 为 MCP Server 和 localContextTools 提供统一的只读查询接口，
 * 不依赖 React 上下文，可直接在服务端/纯逻辑层调用。
 */

import { SegmentMetaService } from '../../services/SegmentMetaService';
import { WorkspaceReadModelService } from '../../services/WorkspaceReadModelService';
import { getDb, type SegmentMetaDocType } from '../../db';
import { listUnitTextsByUnit } from '../../services/LayerSegmentationTextService';

export interface SegmentSummary {
  id: string;
  kind: string;
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationStatus?: string;
}

export interface SegmentDetail {
  id: string;
  kind: string;
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime: number;
  endTime: number;
  transcription: string;
  speakerId?: string;
  annotationStatus?: string;
  layers?: Array<{ layerId: string; type: string; text?: string }>;
  annotations?: Array<{ category: string; value: string }>;
  translations?: Array<{ id: string; layerId?: string; text: string; modality?: string }>;
}

export interface ProjectQualityDiagnosis {
  scope: string;
  summary: {
    totalSegments: number;
    transcribedSegments: number;
    untranscribedSegments: number;
    segmentsWithSpeaker: number;
    segmentsMissingSpeaker: number;
    translationLayers: number;
  };
  recommendations: string[];
}

export interface SegmentReadQueryScope {
  /** 项目级 | project scope */
  textId?: string;
  /** 当前媒体 | current media/track */
  mediaId?: string;
  /** 当前层 | current layer */
  layerId?: string;
}

function mapSegmentMetaToSummary(row: SegmentMetaDocType): SegmentSummary {
  return {
    id: row.segmentId,
    kind: row.unitKind ?? 'segment',
    layerId: row.layerId,
    ...(row.textId ? { textId: row.textId } : {}),
    ...(row.mediaId ? { mediaId: row.mediaId } : {}),
    startTime: row.startTime,
    endTime: row.endTime,
    transcription: row.text,
    ...(row.effectiveSpeakerId ? { speakerId: row.effectiveSpeakerId } : {}),
    ...(row.annotationStatus ? { annotationStatus: row.annotationStatus } : {}),
  };
}

function filterRowsByScope(rows: SegmentMetaDocType[], scope: SegmentReadQueryScope): SegmentMetaDocType[] {
  return rows.filter((row) => {
    if (scope.textId && row.textId !== scope.textId) return false;
    if (scope.mediaId && row.mediaId !== scope.mediaId) return false;
    if (scope.layerId && row.layerId !== scope.layerId) return false;
    return true;
  });
}

function readFirstMultilangText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const first = Object.values(value as Record<string, unknown>).find((entry) => typeof entry === 'string');
  return typeof first === 'string' ? first : '';
}

/**
 * 列出语段摘要
 * @param scope 查询范围（project / media / layer）
 * @param limit 最大返回条数（默认 20，最大 100）
 * @param offset 分页偏移（默认 0）
 */
export async function listSegmentSummaries(
  scope: SegmentReadQueryScope,
  limit = 20,
  offset = 0,
): Promise<{ segments: SegmentSummary[]; total: number }> {
  const clampedLimit = Math.min(100, Math.max(1, limit));
  const clampedOffset = Math.max(0, offset);

  let rows: SegmentMetaDocType[] = [];

  if (scope.layerId && scope.mediaId) {
    await SegmentMetaService.rebuildForLayerMedia(scope.layerId, scope.mediaId);
    rows = await SegmentMetaService.listByLayerMedia(scope.layerId, scope.mediaId);
  } else if (scope.mediaId) {
    rows = await SegmentMetaService.listByMediaId(scope.mediaId);
  } else {
    rows = await SegmentMetaService.listAll();
  }

  rows = filterRowsByScope(rows, scope);

  const total = rows.length;
  const page = rows.slice(clampedOffset, clampedOffset + clampedLimit);

  return {
    segments: page.map(mapSegmentMetaToSummary),
    total,
  };
}

/**
 * 获取单个语段详情
 * @param segmentId 语段 ID
 * @param scope 查询范围（用于限定搜索空间）
 */
export async function getSegmentDetail(
  segmentId: string,
  scope: SegmentReadQueryScope,
): Promise<SegmentDetail | null> {
  const id = segmentId.trim();
  if (!id) return null;

  let rows: SegmentMetaDocType[] = [];

  if (scope.layerId && scope.mediaId) {
    rows = await SegmentMetaService.listByLayerMedia(scope.layerId, scope.mediaId);
  } else if (scope.mediaId) {
    rows = await SegmentMetaService.listByMediaId(scope.mediaId);
  } else {
    rows = await SegmentMetaService.listAll();
  }

  rows = filterRowsByScope(rows, scope);

  const hit = rows.find((row) => row.segmentId === id || row.id === id);
  if (!hit) return null;

  let layers: SegmentDetail['layers'] = [];
  let annotations: SegmentDetail['annotations'] = [];
  let translations: SegmentDetail['translations'] = [];

  try {
    const db = await getDb();
    const [unitTexts, unitNotes] = await Promise.all([
      listUnitTextsByUnit(db, hit.segmentId),
      db.dexie.user_notes.where('[targetType+targetId]').equals(['unit', hit.segmentId]).toArray(),
    ]);

    const layerSeen = new Set<string>();
    layers = unitTexts.flatMap((row) => {
      const layerId = typeof row.layerId === 'string' && row.layerId.trim().length > 0 ? row.layerId : hit.layerId;
      const type = typeof row.contentRole === 'string' && row.contentRole.trim().length > 0 ? row.contentRole : 'primary_text';
      const text = typeof row.text === 'string' && row.text.trim().length > 0 ? row.text : undefined;
      const key = `${layerId}::${type}::${text ?? ''}`;
      if (layerSeen.has(key)) return [];
      layerSeen.add(key);
      return [{
        layerId,
        type,
        ...(text ? { text } : {}),
      }];
    });

    translations = unitTexts
      .filter((row) => typeof row.text === 'string' && row.text.trim().length > 0)
      .map((row) => ({
        id: row.id,
        ...(typeof row.layerId === 'string' && row.layerId.trim().length > 0 ? { layerId: row.layerId } : {}),
        text: row.text!,
        ...(typeof row.modality === 'string' && row.modality.trim().length > 0 ? { modality: row.modality } : {}),
      }));

    annotations = unitNotes
      .map((note) => ({
        category: note.category ?? 'note',
        value: readFirstMultilangText(note.content),
      }))
      .filter((item) => item.value.trim().length > 0);
  } catch {
    // ignore detail expansion errors and return base segment payload
  }

  if (annotations.length === 0 && hit.annotationStatus) {
    annotations = [{ category: 'status', value: hit.annotationStatus }];
  }

  return {
    id: hit.segmentId,
    kind: hit.unitKind ?? 'segment',
    layerId: hit.layerId,
    textId: hit.textId,
    mediaId: hit.mediaId,
    startTime: hit.startTime,
    endTime: hit.endTime,
    transcription: hit.text,
    ...(hit.effectiveSpeakerId ? { speakerId: hit.effectiveSpeakerId } : {}),
    ...(hit.annotationStatus ? { annotationStatus: hit.annotationStatus } : {}),
    ...(layers.length > 0 ? { layers } : {}),
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(translations.length > 0 ? { translations } : {}),
  };
}

/**
 * 诊断项目质量
 * @param scope 查询范围
 */
export async function diagnoseProjectQuality(
  scope: SegmentReadQueryScope,
): Promise<ProjectQualityDiagnosis | null> {
  const textId = scope.textId?.trim() ?? '';

  if (textId) {
    await WorkspaceReadModelService.rebuildForText(textId);
  }

  const filters = {
    ...(textId ? { textId } : {}),
    ...(scope.mediaId ? { mediaId: scope.mediaId } : {}),
    ...(scope.layerId ? { layerId: scope.layerId } : {}),
  };

  const summary = await WorkspaceReadModelService.summarizeQuality(filters);

  let translationLayers = 0;
  const scopeType = scope.layerId ? 'layer' : scope.mediaId ? 'media' : 'project';
  const scopeKey = scope.layerId ?? scope.mediaId ?? textId;
  if (scopeKey) {
    const stats = await WorkspaceReadModelService.getScopeStats(scopeType, scopeKey, textId || undefined);
    translationLayers = stats?.translationLayerCount ?? 0;
  }

  const scopeLabel = scope.layerId && scope.mediaId
    ? 'layer_media'
    : scope.mediaId
      ? 'current_media'
      : 'project';

  const totalSegments = summary.totalUnitsInScope;
  const untranscribedSegments = summary.breakdown.emptyTextCount;
  const transcribedSegments = totalSegments - untranscribedSegments;
  const segmentsMissingSpeaker = summary.breakdown.missingSpeakerCount;
  const segmentsWithSpeaker = totalSegments - segmentsMissingSpeaker;

  const recommendations: string[] = [];
  if (untranscribedSegments > 0) {
    recommendations.push(`${untranscribedSegments} segments remain untranscribed; consider batch transcription.`);
  }
  if (segmentsMissingSpeaker > 0) {
    recommendations.push(`${segmentsMissingSpeaker} segments are missing speaker labels; review speaker assignment.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('No obvious quality issues detected.');
  }

  return {
    scope: scopeLabel,
    summary: {
      totalSegments,
      transcribedSegments,
      untranscribedSegments,
      segmentsWithSpeaker,
      segmentsMissingSpeaker,
      translationLayers,
    },
    recommendations,
  };
}
