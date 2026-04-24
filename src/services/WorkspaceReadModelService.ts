import {
  dexieStoresForAiTaskSnapshotsRw,
  dexieStoresForLanguageAssetOverviewRw,
  dexieStoresForLayerUnitsAndContentsRw,
  dexieStoresForWorkspaceSnapshotRebuildRw,
  getDb,
  withTransaction,
  type AiTaskSnapshotDocType,
  type LanguageAssetOverviewDocType,
  type LayerDocType,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type ScopeStatsSnapshotDocType,
  type ScopeStatsSnapshotScopeType,
  type SegmentMetaDocType,
  type SegmentQualityIssueKey,
  type SegmentQualitySeverity,
  type SegmentQualitySnapshotDocType,
  type SpeakerProfileSnapshotDocType,
  type TranslationSnapshotStatus,
  type TranslationStatusSnapshotDocType,
} from '../db';
import { SegmentMetaService } from './SegmentMetaService';

const LOW_AI_CONFIDENCE_THRESHOLD = 0.6;

export interface WorkspaceTextReadModelRebuildResult {
  qualityCount: number;
  scopeStatsCount: number;
  speakerProfileCount: number;
  translationStatusCount: number;
}

export interface WorkspaceQualitySummary {
  count: number;
  items: Array<{ category: string; count: number }>;
  breakdown: {
    emptyTextCount: number;
    missingSpeakerCount: number;
    lowAiConfidenceCount: number;
    todoNoteCount: number;
  };
  totalUnitsInScope: number;
  completionRate: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTextValue(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveLatestIso(...values: Array<string | undefined>): string {
  const normalized = values
    .map((value) => normalizeTextValue(value))
    .filter((value): value is string => value.length > 0)
    .sort();
  return normalized[normalized.length - 1] ?? nowIso();
}

function toFiniteDateMs(value: string | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return roundTo(total / values.length, 3);
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => normalizeTextValue(value)).filter((value) => value.length > 0))];
}

function buildScopeDocId(scopeType: ScopeStatsSnapshotScopeType, scopeKey: string, textId?: string): string {
  if (scopeType === 'project') return `project::${textId ?? scopeKey}`;
  if (scopeType === 'speaker' && textId) return `speaker::${scopeKey}::${textId}`;
  return `${scopeType}::${scopeKey}`;
}

function detectIssueKeys(row: SegmentMetaDocType): SegmentQualityIssueKey[] {
  const issueKeys: SegmentQualityIssueKey[] = [];
  if (!row.hasText) issueKeys.push('empty_text');
  if (!normalizeTextValue(row.effectiveSpeakerId)) issueKeys.push('missing_speaker');
  if (typeof row.aiConfidence === 'number' && row.aiConfidence < LOW_AI_CONFIDENCE_THRESHOLD) {
    issueKeys.push('low_ai_confidence');
  }
  if (row.noteCategoryKeys?.includes('todo')) issueKeys.push('todo_note');
  return issueKeys;
}

function resolveSeverity(issueCount: number): SegmentQualitySeverity {
  if (issueCount >= 2) return 'critical';
  if (issueCount === 1) return 'warning';
  return 'ok';
}

function buildSegmentQualityDocs(rows: readonly SegmentMetaDocType[]): SegmentQualitySnapshotDocType[] {
  return rows.map((row) => {
    const issueKeys = detectIssueKeys(row);
    return {
      id: row.id,
      segmentId: row.segmentId,
      textId: row.textId,
      mediaId: row.mediaId,
      layerId: row.layerId,
      ...(row.hostUnitId ? { hostUnitId: row.hostUnitId } : {}),
      ...(row.effectiveSpeakerId ? { speakerId: row.effectiveSpeakerId } : {}),
      ...(row.effectiveSpeakerName ? { speakerName: row.effectiveSpeakerName } : {}),
      emptyText: !row.hasText,
      missingSpeaker: !normalizeTextValue(row.effectiveSpeakerId),
      lowAiConfidence: typeof row.aiConfidence === 'number' && row.aiConfidence < LOW_AI_CONFIDENCE_THRESHOLD,
      hasTodoNote: row.noteCategoryKeys?.includes('todo') ?? false,
      issueKeys,
      issueCount: issueKeys.length,
      severity: resolveSeverity(issueKeys.length),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

function buildScopeStatsDocs(
  rows: readonly SegmentMetaDocType[],
  layers: readonly LayerDocType[],
  textId: string,
): ScopeStatsSnapshotDocType[] {
  const translationLayerCount = layers.filter((layer) => layer.layerType === 'translation').length;
  const makeDoc = (
    scopeType: ScopeStatsSnapshotScopeType,
    scopeKey: string,
    scopedRows: readonly SegmentMetaDocType[],
    extra: Partial<Pick<ScopeStatsSnapshotDocType, 'mediaId' | 'layerId' | 'speakerId'>> = {},
  ): ScopeStatsSnapshotDocType => {
    const speakerIds = uniqueNonEmpty(scopedRows.map((row) => row.effectiveSpeakerId));
    const aiConfidenceValues = scopedRows
      .flatMap((row) => (typeof row.aiConfidence === 'number' ? [row.aiConfidence] : []));
    return {
      id: buildScopeDocId(scopeType, scopeKey, textId),
      scopeType,
      scopeKey,
      textId,
      ...(extra.mediaId ? { mediaId: extra.mediaId } : {}),
      ...(extra.layerId ? { layerId: extra.layerId } : {}),
      ...(extra.speakerId ? { speakerId: extra.speakerId } : {}),
      unitCount: scopedRows.length,
      segmentCount: scopedRows.filter((row) => row.unitKind === 'segment').length,
      speakerCount: speakerIds.length,
      translationLayerCount,
      noteFlaggedCount: scopedRows.filter((row) => (row.noteCategoryKeys?.length ?? 0) > 0).length,
      untranscribedCount: scopedRows.filter((row) => !row.hasText).length,
      missingSpeakerCount: scopedRows.filter((row) => !normalizeTextValue(row.effectiveSpeakerId)).length,
      ...(average(aiConfidenceValues) !== null ? { avgAiConfidence: average(aiConfidenceValues) } : { avgAiConfidence: null }),
      createdAt: nowIso(),
      updatedAt: resolveLatestIso(...scopedRows.map((row) => row.updatedAt)),
    };
  };

  const docs: ScopeStatsSnapshotDocType[] = [];
  docs.push(makeDoc('project', textId, rows));
  docs.push(makeDoc('text', textId, rows));

  const byMedia = new Map<string, SegmentMetaDocType[]>();
  const byLayer = new Map<string, SegmentMetaDocType[]>();
  const bySpeaker = new Map<string, SegmentMetaDocType[]>();

  for (const row of rows) {
    const mediaId = normalizeTextValue(row.mediaId);
    if (mediaId) {
      const bucket = byMedia.get(mediaId);
      if (bucket) bucket.push(row);
      else byMedia.set(mediaId, [row]);
    }

    const layerId = normalizeTextValue(row.layerId);
    if (layerId) {
      const bucket = byLayer.get(layerId);
      if (bucket) bucket.push(row);
      else byLayer.set(layerId, [row]);
    }

    const speakerId = normalizeTextValue(row.effectiveSpeakerId);
    if (speakerId) {
      const bucket = bySpeaker.get(speakerId);
      if (bucket) bucket.push(row);
      else bySpeaker.set(speakerId, [row]);
    }
  }

  for (const [mediaId, scopedRows] of byMedia.entries()) {
    docs.push(makeDoc('media', mediaId, scopedRows, { mediaId }));
  }
  for (const [layerId, scopedRows] of byLayer.entries()) {
    docs.push(makeDoc('layer', layerId, scopedRows, { layerId }));
  }
  for (const [speakerId, scopedRows] of bySpeaker.entries()) {
    docs.push(makeDoc('speaker', speakerId, scopedRows, { speakerId }));
  }

  return docs;
}

function buildSpeakerProfileDocs(rows: readonly SegmentMetaDocType[], textId: string): SpeakerProfileSnapshotDocType[] {
  const bySpeaker = new Map<string, SegmentMetaDocType[]>();
  for (const row of rows) {
    const speakerId = normalizeTextValue(row.effectiveSpeakerId);
    if (!speakerId) continue;
    const bucket = bySpeaker.get(speakerId);
    if (bucket) bucket.push(row);
    else bySpeaker.set(speakerId, [row]);
  }

  return [...bySpeaker.entries()].map(([speakerId, scopedRows]) => {
    const speakerName = normalizeTextValue(scopedRows[0]?.effectiveSpeakerName);
    return {
      id: `speaker::${speakerId}::${textId}`,
      textId,
      speakerId,
      ...(speakerName ? { speakerName } : {}),
      unitCount: scopedRows.length,
      segmentCount: scopedRows.filter((row) => row.unitKind === 'segment').length,
      totalDurationSec: roundTo(scopedRows.reduce((sum, row) => sum + Math.max(0, row.endTime - row.startTime), 0), 3),
      noteFlaggedCount: scopedRows.filter((row) => (row.noteCategoryKeys?.length ?? 0) > 0).length,
      emptyTextCount: scopedRows.filter((row) => !row.hasText).length,
      createdAt: nowIso(),
      updatedAt: resolveLatestIso(...scopedRows.map((row) => row.updatedAt)),
    };
  });
}

function buildTranslationStatusDocs(
  unitRows: readonly LayerUnitDocType[],
  contentRows: readonly LayerUnitContentDocType[],
  layers: readonly LayerDocType[],
): TranslationStatusSnapshotDocType[] {
  const translationLayerIds = new Set(
    layers.filter((layer) => layer.layerType === 'translation').map((layer) => layer.id),
  );
  if (translationLayerIds.size === 0) return [];

  const contentsByUnitId = new Map<string, LayerUnitContentDocType[]>();
  for (const row of contentRows) {
    const unitId = row.unitId?.trim();
    if (!unitId) continue;
    const bucket = contentsByUnitId.get(unitId);
    if (bucket) bucket.push(row);
    else contentsByUnitId.set(unitId, [row]);
  }

  return unitRows
    .filter((row) => Boolean(row.layerId && translationLayerIds.has(row.layerId)))
    .map((row) => {
      const candidateContents = contentsByUnitId.get(row.id) ?? [];
      const content = candidateContents.find((item) => item.contentRole === 'translation')
        ?? candidateContents.find((item) => item.contentRole === 'primary_text')
        ?? candidateContents[0];
      const text = normalizeTextValue(content?.text);
      const hasText = text.length > 0;
      let status: TranslationSnapshotStatus = 'draft';
      if (!hasText) {
        status = 'missing';
      } else if (content?.isVerified || row.status === 'verified') {
        status = 'verified';
      } else if (row.status === 'translated' || row.status === 'glossed') {
        status = 'translated';
      }
      return {
        id: `${row.layerId ?? ''}::${row.id}`,
        unitId: row.id,
        textId: row.textId,
        mediaId: row.mediaId ?? '',
        layerId: row.layerId ?? '',
        ...(row.parentUnitId ? { parentUnitId: row.parentUnitId } : {}),
        status,
        hasText,
        textLength: text.length,
        ...(content?.sourceType ? { sourceType: content.sourceType } : {}),
        createdAt: row.createdAt,
        updatedAt: resolveLatestIso(row.updatedAt, content?.updatedAt),
      };
    });
}

export class WorkspaceReadModelService {
  static async rebuildForText(textId: string): Promise<WorkspaceTextReadModelRebuildResult> {
    const normalizedTextId = normalizeTextValue(textId);
    if (!normalizedTextId) {
      return {
        qualityCount: 0,
        scopeStatsCount: 0,
        speakerProfileCount: 0,
        translationStatusCount: 0,
      };
    }

    const db = await getDb();
    const [unitRows, contentRows] = await withTransaction(
      db,
      'r',
      [...dexieStoresForLayerUnitsAndContentsRw(db)],
      async () => Promise.all([
        db.dexie.layer_units.where('textId').equals(normalizedTextId).toArray(),
        db.dexie.layer_unit_contents.where('textId').equals(normalizedTextId).toArray(),
      ]),
      { label: 'WorkspaceReadModelService.rebuildForText.sourceRead' },
    );
    const layerDocsWrapped = await db.collections.layers.find().exec();

    const layers = layerDocsWrapped
      .map((doc) => doc.toJSON())
      .filter((row) => row.textId === normalizedTextId);

    const scopes = [...new Map(
      unitRows
        .filter((row) => row.layerId && row.mediaId)
        .map((row) => [`${row.layerId}::${row.mediaId}`, { layerId: row.layerId!, mediaId: row.mediaId! }] as const),
    ).values()];
    if (scopes.length > 0) {
      await SegmentMetaService.rebuildScopes(scopes);
    }

    const segmentMetaRows = await db.dexie.segment_meta.where('textId').equals(normalizedTextId).toArray();
    const qualityDocs = buildSegmentQualityDocs(segmentMetaRows);
    const scopeStatsDocs = buildScopeStatsDocs(segmentMetaRows, layers, normalizedTextId);
    const speakerProfileDocs = buildSpeakerProfileDocs(segmentMetaRows, normalizedTextId);
    const translationStatusDocs = buildTranslationStatusDocs(unitRows, contentRows, layers);

    await withTransaction(
      db,
      'rw',
      [...dexieStoresForWorkspaceSnapshotRebuildRw(db)],
      async () => {
        await Promise.all([
          db.dexie.segment_quality_snapshots.where('textId').equals(normalizedTextId).delete(),
          db.dexie.scope_stats_snapshots.where('textId').equals(normalizedTextId).delete(),
          db.dexie.speaker_profile_snapshots.where('textId').equals(normalizedTextId).delete(),
          db.dexie.translation_status_snapshots.where('textId').equals(normalizedTextId).delete(),
        ]);

        if (qualityDocs.length > 0) await db.dexie.segment_quality_snapshots.bulkPut(qualityDocs);
        if (scopeStatsDocs.length > 0) await db.dexie.scope_stats_snapshots.bulkPut(scopeStatsDocs);
        if (speakerProfileDocs.length > 0) await db.dexie.speaker_profile_snapshots.bulkPut(speakerProfileDocs);
        if (translationStatusDocs.length > 0) await db.dexie.translation_status_snapshots.bulkPut(translationStatusDocs);
      },
      { label: 'WorkspaceReadModelService.rebuildForText.write' },
    );

    return {
      qualityCount: qualityDocs.length,
      scopeStatsCount: scopeStatsDocs.length,
      speakerProfileCount: speakerProfileDocs.length,
      translationStatusCount: translationStatusDocs.length,
    };
  }

  static async rebuildLanguageAssetOverview(): Promise<LanguageAssetOverviewDocType[]> {
    const db = await getDb();
    const [languages, displayNames, aliases, orthographies, bridges] = await Promise.all([
      db.dexie.languages.toArray(),
      db.dexie.language_display_names.toArray(),
      db.dexie.language_aliases.toArray(),
      db.dexie.orthographies.toArray(),
      db.dexie.orthography_bridges.toArray(),
    ]);

    const displayNameByLanguageId = new Map<string, string>();
    for (const row of displayNames) {
      if (row.role === 'preferred' && !displayNameByLanguageId.has(row.languageId)) {
        displayNameByLanguageId.set(row.languageId, row.value);
      }
    }

    const orthographyIdsByLanguageId = new Map<string, Set<string>>();
    for (const row of orthographies) {
      const languageId = normalizeTextValue(row.languageId);
      if (!languageId) continue;
      const bucket = orthographyIdsByLanguageId.get(languageId) ?? new Set<string>();
      bucket.add(row.id);
      orthographyIdsByLanguageId.set(languageId, bucket);
    }

    const bridgeIdsByLanguageId = new Map<string, Set<string>>();
    for (const bridge of bridges) {
      const relatedLanguageIds = new Set<string>();
      for (const [languageId, orthographyIds] of orthographyIdsByLanguageId.entries()) {
        if (orthographyIds.has(bridge.sourceOrthographyId) || orthographyIds.has(bridge.targetOrthographyId)) {
          relatedLanguageIds.add(languageId);
        }
      }
      for (const languageId of relatedLanguageIds) {
        const bucket = bridgeIdsByLanguageId.get(languageId) ?? new Set<string>();
        bucket.add(bridge.id);
        bridgeIdsByLanguageId.set(languageId, bucket);
      }
    }

    const docs: LanguageAssetOverviewDocType[] = languages.map((language) => {
      const languageDisplayNames = displayNames.filter((row) => row.languageId === language.id);
      const languageAliases = aliases.filter((row) => row.languageId === language.id);
      const languageOrthographies = orthographies.filter((row) => row.languageId === language.id);
      const languageOrthographyIds = new Set(languageOrthographies.map((row) => row.id));
      const languageBridges = bridges.filter((row) => (
        languageOrthographyIds.has(row.sourceOrthographyId)
        || languageOrthographyIds.has(row.targetOrthographyId)
      ));
      const aliasCount = languageAliases.length;
      const orthographyCount = orthographyIdsByLanguageId.get(language.id)?.size ?? 0;
      const bridgeCount = bridgeIdsByLanguageId.get(language.id)?.size ?? 0;
      const displayName = normalizeTextValue(displayNameByLanguageId.get(language.id))
        || normalizeTextValue(language.autonym)
        || Object.values(language.name).map((value) => normalizeTextValue(value)).find((value) => value.length > 0)
        || language.id;
      const completenessParts = [
        normalizeTextValue(language.languageCode || language.canonicalTag || language.iso6393).length > 0,
        displayName.length > 0,
        orthographyCount > 0,
        bridgeCount > 0,
        Boolean(language.customFields && Object.keys(language.customFields).length > 0) || aliasCount > 0,
      ];
      return {
        id: language.id,
        languageId: language.id,
        displayName,
        aliasCount,
        orthographyCount,
        bridgeCount,
        hasCustomFields: Boolean(language.customFields && Object.keys(language.customFields).length > 0),
        completenessScore: roundTo(completenessParts.filter(Boolean).length / completenessParts.length, 2),
        createdAt: language.createdAt,
        updatedAt: resolveLatestIso(
          language.updatedAt,
          ...languageDisplayNames.map((row) => row.updatedAt),
          ...languageAliases.map((row) => row.updatedAt),
          ...languageOrthographies.map((row) => row.updatedAt),
          ...languageBridges.map((row) => row.updatedAt),
        ),
      };
    });

    await withTransaction(db, 'rw', [...dexieStoresForLanguageAssetOverviewRw(db)], async () => {
      await db.dexie.language_asset_overviews.clear();
      if (docs.length > 0) {
        await db.dexie.language_asset_overviews.bulkPut(docs);
      }
    }, { label: 'WorkspaceReadModelService.rebuildLanguageAssetOverview' });

    return docs;
  }

  static async rebuildAiTaskSnapshots(): Promise<AiTaskSnapshotDocType[]> {
    const db = await getDb();
    const tasks = await db.dexie.ai_tasks.toArray();
    const docs = tasks.map((task) => ({
      id: task.id,
      taskId: task.id,
      taskType: task.taskType,
      status: task.status,
      targetId: task.targetId,
      ...(task.targetType ? { targetType: task.targetType } : {}),
      ...(task.modelId ? { modelId: task.modelId } : {}),
      hasError: normalizeTextValue(task.errorMessage).length > 0 || task.status === 'failed',
      isTerminal: task.status === 'done' || task.status === 'failed',
      durationMs: Math.max(0, toFiniteDateMs(task.updatedAt) - toFiniteDateMs(task.createdAt)),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));

    await withTransaction(db, 'rw', [...dexieStoresForAiTaskSnapshotsRw(db)], async () => {
      await db.dexie.ai_task_snapshots.clear();
      if (docs.length > 0) {
        await db.dexie.ai_task_snapshots.bulkPut(docs);
      }
    }, { label: 'WorkspaceReadModelService.rebuildAiTaskSnapshots' });

    return docs;
  }

  static async getScopeStats(scopeType: ScopeStatsSnapshotScopeType, scopeKey: string, textId?: string): Promise<ScopeStatsSnapshotDocType | null> {
    const db = await getDb();
    const rows = await db.dexie.scope_stats_snapshots
      .where('[scopeType+scopeKey]')
      .equals([scopeType, scopeKey])
      .toArray();
    if (rows.length === 0) return null;
    if (textId) {
      return rows.find((row) => row.textId === textId) ?? rows[0] ?? null;
    }
    return rows[0] ?? null;
  }

  static async listQualitySnapshots(filters: {
    textId?: string;
    mediaId?: string;
    layerId?: string;
    speakerId?: string;
  }): Promise<SegmentQualitySnapshotDocType[]> {
    const db = await getDb();
    let rows: SegmentQualitySnapshotDocType[];
    if (filters.layerId && filters.mediaId) {
      rows = await db.dexie.segment_quality_snapshots.where('[layerId+mediaId]').equals([filters.layerId, filters.mediaId]).toArray();
    } else if (filters.textId) {
      rows = await db.dexie.segment_quality_snapshots.where('textId').equals(filters.textId).toArray();
    } else if (filters.layerId) {
      rows = await db.dexie.segment_quality_snapshots.where('layerId').equals(filters.layerId).toArray();
    } else {
      rows = await db.dexie.segment_quality_snapshots.toArray();
    }

    return rows.filter((row) => {
      if (filters.speakerId && row.speakerId !== filters.speakerId) return false;
      return true;
    });
  }

  static async summarizeQuality(filters: {
    textId?: string;
    mediaId?: string;
    layerId?: string;
    speakerId?: string;
  }): Promise<WorkspaceQualitySummary> {
    const rows = await WorkspaceReadModelService.listQualitySnapshots(filters);
    const emptyTextCount = rows.filter((row) => row.emptyText).length;
    const missingSpeakerCount = rows.filter((row) => row.missingSpeaker).length;
    const lowAiConfidenceCount = rows.filter((row) => row.lowAiConfidence).length;
    const todoNoteCount = rows.filter((row) => row.hasTodoNote).length;
    const items = [
      { category: 'missing_speaker', count: missingSpeakerCount },
      { category: 'empty_text', count: emptyTextCount },
      { category: 'low_ai_confidence', count: lowAiConfidenceCount },
      { category: 'todo_note', count: todoNoteCount },
    ].filter((item) => item.count > 0);

    const totalUnitsInScope = rows.length;
    const completionRate = totalUnitsInScope > 0
      ? Math.max(0, Math.min(1, (totalUnitsInScope - emptyTextCount) / totalUnitsInScope))
      : 1;

    return {
      count: items.length,
      items,
      breakdown: {
        emptyTextCount,
        missingSpeakerCount,
        lowAiConfidenceCount,
        todoNoteCount,
      },
      totalUnitsInScope,
      completionRate,
    };
  }
}
