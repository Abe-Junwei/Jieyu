/**
 * Dexie 数据库引擎 | Dexie database engine
 *
 * JieyuDexie: 带完整 schema 版本链的 Dexie 子类
 * Migration helpers: v22/v28 回填辅助函数
 * Instance: 单例管理与 JieyuDatabase 工厂
 */
import Dexie, { type Table, type Transaction } from 'dexie';
import type { TextDocType, MediaItemDocType, LayerUnitDocType, UnitTokenDocType, UnitMorphemeDocType, AnchorDocType, LexemeDocType, TokenLexemeLinkDocType, AiTaskDoc, EmbeddingDoc, AiConversationDoc, AiMessageDoc, LanguageDocType, LanguageDisplayNameDocType, LanguageAliasDocType, LanguageCatalogHistoryDocType, CustomFieldDefinitionDocType, SpeakerDocType, OrthographyDocType, OrthographyBridgeDocType, LocationDocType, BibliographicSourceDocType, GrammarDocDocType, AbbreviationDocType, StructuralRuleProfileAssetDocType, PhonemeDocType, TagDefinitionDocType, LayerDocType, LayerUnitContentDocType, UnitRelationDocType, LayerLinkDocType, TierDefinitionDocType, TierAnnotationDocType, AuditLogDocType, UserNoteDocType, SegmentMetaDocType, SegmentQualitySnapshotDocType, ScopeStatsSnapshotDocType, SpeakerProfileSnapshotDocType, TranslationStatusSnapshotDocType, LanguageAssetOverviewDocType, AiTaskSnapshotDocType, TrackEntityDocType, SegmentationV2BackfillRows, V28BackfillPlan, JieyuCollections } from './types';
import { validateTextDoc, validateMediaItemDoc, validateUnitTokenDoc, validateUnitMorphemeDoc, validateAnchorDoc, validateLexemeDoc, validateTokenLexemeLinkDoc, validateAiTaskDoc, validateEmbeddingDoc, validateAiConversationDoc, validateAiMessageDoc, validateLanguageDoc, validateLanguageDisplayNameDoc, validateLanguageAliasDoc, validateLanguageCatalogHistoryDoc, validateCustomFieldDefinitionDoc, validateSpeakerDoc, validateOrthographyDoc, validateOrthographyBridgeDoc, validateLocationDoc, validateBibliographicSourceDoc, validateGrammarDoc, validateAbbreviationDoc, validateStructuralRuleProfileAssetDoc, validatePhonemeDoc, validateLayerDoc, validateLayerUnitDoc, validateLayerUnitContentDoc, validateUnitRelationDoc, validateLayerLinkDoc, validateTierDefinitionDoc, validateTierAnnotationDoc, validateAuditLogDoc, validateUserNoteDoc, validateSegmentMetaDoc, validateSegmentQualitySnapshotDoc, validateScopeStatsSnapshotDoc, validateSpeakerProfileSnapshotDoc, validateTranslationStatusSnapshotDoc, validateLanguageAssetOverviewDoc, validateAiTaskSnapshotDoc, validateTrackEntityDoc } from './schemas';
import { DexieCollectionAdapter, TierBackedLayerCollectionAdapter, resolveBridgeId, BRIDGE_TIER_PREFIX } from './adapter';
import { upgradeM18LinguisticUnitCutover } from './migrations/m18LinguisticUnitCutover';
import { upgradeM41SelfCertaintyHostDepollute } from './migrations/m41SelfCertaintyHostDepollute';
import { upgradeM42TrackEntityDocumentIds } from './migrations/m42TrackEntityDocumentIds';
import { markBackupDirtySinceLastExport } from '../utils/backupExportReminderState';
import {
  isDexieIndexedQueryFallbackError,
  reportDexieIndexedQueryFallback,
  reportUnexpectedDexieQueryError,
} from './adapterDexieQueryErrors';
import { createPreMigrationBackupSnapshot } from './preMigrationBackup';

/**
 * IndexedDB 物理库名。绿场重置时抬升后缀，使旧库 `jieyudb` 留在磁盘但应用不再打开。
 * Physical IndexedDB name. Bump suffix for greenfield resets so legacy DB files are abandoned in-place.
 */
export const JIEYU_DEXIE_DB_NAME = 'jieyudb_v2' as const;

/**
 * 须与 `JieyuDexie` 构造器内**最高**的 `this.version(…)` 号一致，供健康检查 / 迁移回放测试（ARCH-5）。
 * Must match the highest `this.version(…)` in `JieyuDexie` — health + migration-replay (ARCH-5).
 */
export const JIEYU_DEXIE_TARGET_SCHEMA_VERSION = 44;

export function buildSegmentationV2BackfillRows(input: {
  units: LayerUnitDocType[];
  unitTexts: LayerUnitContentDocType[];
  tiers: TierDefinitionDocType[];
  nowIso?: string;
}): SegmentationV2BackfillRows {
  const { units, unitTexts, tiers, nowIso } = input;
  if (units.length === 0) {
    return { segments: [], contents: [], links: [] };
  }

  const now = nowIso ?? new Date().toISOString();
  const transcriptionTierByTextId = new Map<string, string>();
  const tiersByTextId = new Map<string, TierDefinitionDocType[]>();

  for (const tier of tiers) {
    const bucket = tiersByTextId.get(tier.textId);
    if (bucket) {
      bucket.push(tier);
    } else {
      tiersByTextId.set(tier.textId, [tier]);
    }
  }

  for (const [textId, bucket] of tiersByTextId.entries()) {
    const candidates = bucket
      .filter((item) => item.contentType === 'transcription')
      .sort((a, b) => {
        const defaultCmp = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
        if (defaultCmp !== 0) return defaultCmp;
        const sortA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const sortB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) return sortA - sortB;
        return a.id.localeCompare(b.id);
      });
    const picked = candidates[0];
    if (picked) transcriptionTierByTextId.set(textId, picked.id);
  }

  const buildSegmentId = (layerId: string, unitId: string) => `segv22_${layerId}_${unitId}`;
  const buildContentId = (unitTextId: string) => unitTextId;
  const buildLinkId = (layerId: string, unitId: string) => `seglv22_${layerId}_${unitId}`;

  const segmentById = new Map<string, LayerUnitDocType>();
  const contentById = new Map<string, LayerUnitContentDocType>();
  const linkById = new Map<string, UnitRelationDocType>();
  const unitById = new Map(units.map((item) => [item.id, item]));

  const ensureSegment = (
    unit: LayerUnitDocType,
    layerId: string,
  ): LayerUnitDocType => {
    const segmentId = buildSegmentId(layerId, unit.id);
    const existing = segmentById.get(segmentId);
    if (existing) return existing;

    const next: LayerUnitDocType = {
      id: segmentId,
      textId: unit.textId,
      mediaId: unit.mediaId && unit.mediaId.trim().length > 0 ? unit.mediaId : '__unknown_media__',
      layerId,
      unitType: 'segment',
      unitId: unit.id,
      startTime: unit.startTime,
      endTime: unit.endTime,
      ...(unit.startAnchorId ? { startAnchorId: unit.startAnchorId } : {}),
      ...(unit.endAnchorId ? { endAnchorId: unit.endAnchorId } : {}),
      provenance: {
        actorType: 'system',
        method: 'migration',
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    segmentById.set(segmentId, next);
    return next;
  };

  for (const unit of units) {
    const baseLayerId = transcriptionTierByTextId.get(unit.textId);
    if (!baseLayerId) continue;
    ensureSegment(unit, baseLayerId);
  }

  // v22 迁移数据可能仍含 tierId 而非 layerId | v22 migration data may still have tierId instead of layerId
  const getRowLayerId = (row: LayerUnitContentDocType): string =>
    (((row as unknown as Record<string, unknown>).tierId as string | undefined) ?? row.layerId ?? '').trim();

  for (const row of unitTexts) {
    const unitId = row.unitId?.trim();
    if (!unitId) continue;
    const unit = unitById.get(unitId);
    if (!unit) continue;

    const rowLayerId = getRowLayerId(row);
    const targetSegment = ensureSegment(unit, rowLayerId);
    const contentId = buildContentId(row.id);

    contentById.set(contentId, {
      id: contentId,
      textId: unit.textId,
      unitId: targetSegment.id,
      segmentId: targetSegment.id,
      layerId: rowLayerId,
      contentRole: 'primary_text',
      modality: row.modality ?? 'text',
      ...(row.text !== undefined ? { text: row.text } : {}),
      ...(row.translationAudioMediaId ? { translationAudioMediaId: row.translationAudioMediaId } : {}),
      sourceType: row.sourceType ?? 'human',
      ...(row.ai_metadata ? { ai_metadata: row.ai_metadata } : {}),
      ...(row.provenance ? { provenance: row.provenance } : {}),
      ...(row.accessRights ? { accessRights: row.accessRights } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    const baseLayerId = transcriptionTierByTextId.get(unit.textId);
    if (!baseLayerId || baseLayerId === rowLayerId) continue;

    const sourceUnitId = buildSegmentId(baseLayerId, unit.id);
    const linkId = buildLinkId(rowLayerId, unit.id);
    linkById.set(linkId, {
      id: linkId,
      textId: unit.textId,
      sourceUnitId,
      targetUnitId: targetSegment.id,
      sourceLayerId: baseLayerId,
      targetLayerId: rowLayerId,
      unitId: unit.id,
      relationType: 'aligned_to',
      provenance: {
        actorType: 'system',
        method: 'migration',
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    segments: [...segmentById.values()],
    contents: [...contentById.values()],
    links: [...linkById.values()],
  };
}

export function buildV28BackfillPlanForText(input: {
  text: LayerUnitContentDocType;
  unit: LayerUnitDocType;
  nowIso: string;
  existingContent?: LayerUnitContentDocType;
  segmentExists: (segmentId: string) => boolean;
}): V28BackfillPlan | null {
  const { text, unit, nowIso, existingContent, segmentExists } = input;
  const canonicalSegmentId = `segv2_${text.layerId}_${unit.id}`;

  if (existingContent?.segmentId && segmentExists(existingContent.segmentId)) {
    return null;
  }

  const segment: LayerUnitDocType = {
    id: canonicalSegmentId,
    textId: unit.textId,
    mediaId: unit.mediaId && unit.mediaId.trim().length > 0 ? unit.mediaId : '__unknown_media__',
    layerId: text.layerId ?? '',
    unitType: 'segment',
    unitId: unit.id,
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(unit.startAnchorId ? { startAnchorId: unit.startAnchorId } : {}),
    ...(unit.endAnchorId ? { endAnchorId: unit.endAnchorId } : {}),
    provenance: { actorType: 'system', method: 'projection', createdAt: nowIso, updatedAt: nowIso },
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (existingContent) {
    return {
      segment,
      content: {
        ...existingContent,
        segmentId: canonicalSegmentId,
        updatedAt: nowIso,
      },
    };
  }

  const content: LayerUnitContentDocType = {
    id: text.id,
    textId: unit.textId,
    unitId: canonicalSegmentId,
    segmentId: canonicalSegmentId,
    layerId: text.layerId ?? '',
    contentRole: 'primary_text',
    modality: text.modality ?? 'text',
    ...(text.text !== undefined ? { text: text.text } : {}),
    ...(text.translationAudioMediaId ? { translationAudioMediaId: text.translationAudioMediaId } : {}),
    sourceType: text.sourceType ?? 'human',
    ...(text.ai_metadata ? { ai_metadata: text.ai_metadata } : {}),
    ...(text.provenance ? { provenance: text.provenance } : {}),
    ...(text.accessRights ? { accessRights: text.accessRights } : {}),
    createdAt: text.createdAt,
    updatedAt: text.updatedAt,
  };

  return { segment, content };
}

export class JieyuDexie extends Dexie {
  texts!: Table<TextDocType, string>;
  media_items!: Table<MediaItemDocType, string>;
  unit_tokens!: Table<UnitTokenDocType, string>;
  unit_morphemes!: Table<UnitMorphemeDocType, string>;
  anchors!: Table<AnchorDocType, string>;
  lexemes!: Table<LexemeDocType, string>;
  token_lexeme_links!: Table<TokenLexemeLinkDocType, string>;
  ai_tasks!: Table<AiTaskDoc, string>;
  embeddings!: Table<EmbeddingDoc, string>;
  ai_conversations!: Table<AiConversationDoc, string>;
  ai_messages!: Table<AiMessageDoc, string>;
  languages!: Table<LanguageDocType, string>;
  language_display_names!: Table<LanguageDisplayNameDocType, string>;
  language_aliases!: Table<LanguageAliasDocType, string>;
  language_catalog_history!: Table<LanguageCatalogHistoryDocType, string>;
  custom_field_definitions!: Table<CustomFieldDefinitionDocType, string>;
  speakers!: Table<SpeakerDocType, string>;
  orthographies!: Table<OrthographyDocType, string>;
  orthography_transforms!: Table<OrthographyBridgeDocType, string>;
  get orthography_bridges(): Table<OrthographyBridgeDocType, string> {
    return this.orthography_transforms;
  }
  locations!: Table<LocationDocType, string>;
  bibliographic_sources!: Table<BibliographicSourceDocType, string>;
  grammar_docs!: Table<GrammarDocDocType, string>;
  abbreviations!: Table<AbbreviationDocType, string>;
  structural_rule_profiles!: Table<StructuralRuleProfileAssetDocType, string>;
  phonemes!: Table<PhonemeDocType, string>;
  tag_definitions!: Table<TagDefinitionDocType, string>;
  layer_units!: Table<LayerUnitDocType, string>;
  layer_unit_contents!: Table<LayerUnitContentDocType, string>;
  unit_relations!: Table<UnitRelationDocType, string>;
  layer_links!: Table<LayerLinkDocType, string>;
  tier_definitions!: Table<TierDefinitionDocType, string>;
  tier_annotations!: Table<TierAnnotationDocType, string>;
  audit_logs!: Table<AuditLogDocType, string>;
  user_notes!: Table<UserNoteDocType, string>;
  segment_meta!: Table<SegmentMetaDocType, string>;
  segment_quality_snapshots!: Table<SegmentQualitySnapshotDocType, string>;
  scope_stats_snapshots!: Table<ScopeStatsSnapshotDocType, string>;
  speaker_profile_snapshots!: Table<SpeakerProfileSnapshotDocType, string>;
  translation_status_snapshots!: Table<TranslationStatusSnapshotDocType, string>;
  language_asset_overviews!: Table<LanguageAssetOverviewDocType, string>;
  ai_task_snapshots!: Table<AiTaskSnapshotDocType, string>;
  track_entities!: Table<TrackEntityDocType, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      units: 'id, textId, startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, unitId, lexemeId',
      languages: 'id, updatedAt',
      speakers: 'id, updatedAt',
      orthographies: 'id, languageId',
      locations: 'id, country, region',
      bibliographic_sources: 'id, citationKey',
      grammar_docs: 'id, updatedAt, parentId',
      abbreviations: 'id, abbreviation',
      phonemes: 'id, languageId, type',
      tag_definitions: 'id, key',
      translation_layers: 'id, key, languageId, updatedAt, layerType',
      unit_translations: 'id, unitId, translationLayerId, updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(2).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      units: 'id, textId, mediaId, [mediaId+startTime], startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, unitId, lexemeId',
      languages: 'id, updatedAt',
      speakers: 'id, updatedAt',
      orthographies: 'id, languageId',
      locations: 'id, country, region',
      bibliographic_sources: 'id, citationKey',
      grammar_docs: 'id, updatedAt, parentId',
      abbreviations: 'id, abbreviation',
      phonemes: 'id, languageId, type',
      tag_definitions: 'id, key',
      translation_layers: 'id, key, languageId, updatedAt, layerType',
      unit_translations: 'id, unitId, translationLayerId, updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(3).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      units: 'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, unitId, lexemeId',
      languages: 'id, updatedAt',
      speakers: 'id, updatedAt',
      orthographies: 'id, languageId',
      locations: 'id, country, region',
      bibliographic_sources: 'id, citationKey',
      grammar_docs: 'id, updatedAt, parentId',
      abbreviations: 'id, abbreviation',
      phonemes: 'id, languageId, type',
      tag_definitions: 'id, key',
      translation_layers: 'id, key, languageId, updatedAt, layerType',
      unit_translations: 'id, unitId, translationLayerId, [unitId+translationLayerId], updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(4).stores({
      tier_annotations: 'id, tierId, parentAnnotationId, [tierId+startTime], startTime, endTime',
      audit_logs: 'id, collection, documentId, [collection+action], action, timestamp',
    });

    this.version(5).stores({
      user_notes: 'id, [targetType+targetId], [targetId+targetIndex], updatedAt',
    });

    this.version(6).stores({
      anchors: 'id, mediaId, [mediaId+time], time',
    }).upgrade(async (tx: Transaction) => {
      const unitsTable = tx.table('units');
      const anchorsTable = tx.table('anchors');
      const allUnits: LayerUnitDocType[] = await unitsTable.toArray();

      if (allUnits.length === 0) return;

      const now = new Date().toISOString();
      let anchorCounter = 0;

      const anchorsToInsert: AnchorDocType[] = [];
      const unitsToUpdate: LayerUnitDocType[] = [];

      for (const u of allUnits) {
        const mediaId = u.mediaId ?? '';
        const startAnchorId = `anc_${Date.now()}_${++anchorCounter}`;
        const endAnchorId = `anc_${Date.now()}_${++anchorCounter}`;
        anchorsToInsert.push(
          { id: startAnchorId, mediaId, time: u.startTime, createdAt: now },
          { id: endAnchorId, mediaId, time: u.endTime, createdAt: now },
        );
        unitsToUpdate.push({
          ...u,
          startAnchorId,
          endAnchorId,
        });
      }

      await anchorsTable.bulkPut(anchorsToInsert);
      await unitsTable.bulkPut(unitsToUpdate);
    });

    this.version(7).stores({
      corpus_lexicon_links: 'id, unitId, lexemeId, annotationId',
    }).upgrade(async (tx: Transaction) => {
      const linksTable = tx.table('corpus_lexicon_links');
      const allLinks = (await linksTable.toArray()) as Array<{ id: string; unitId: string; lexemeId: string; annotationId: string; wordIndex?: number }>;
      if (allLinks.length === 0) return;
      const updated = allLinks.map((link) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { wordIndex: _wordIndex, ...rest } = link;
        void _wordIndex;
        return rest;
      });
      await linksTable.bulkPut(updated);
    });

    this.version(8).stores({
      tier_annotations: 'id, tierId, parentAnnotationId, [tierId+startTime], startTime, endTime, startAnchorId, endAnchorId',
    });

    this.version(9).stores({
      annotations: null,
    });

    // v10: Rename unit_translations → unit_texts + strip deprecated transcription cache
    this.version(10).stores({
      unit_translations: null,
      unit_texts: 'id, unitId, translationLayerId, [unitId+translationLayerId], updatedAt',
    }).upgrade(async (tx: Transaction) => {
      // 1. Copy all rows from old table to new table
      const oldTable = tx.table('unit_translations');
      const newTable = tx.table('unit_texts');
      const allRows = await oldTable.toArray();
      if (allRows.length > 0) {
        await newTable.bulkPut(allRows);
      }

      // 2. Migrate unit.transcription.default → unit_texts if not yet present
      const unitsTable = tx.table('units');
      const allUnits: LayerUnitDocType[] = await unitsTable.toArray();

      for (const utt of allUnits) {
        const defaultText = utt.transcription?.['default'];
        if (!defaultText) continue;

        // Check if there's already an unit_text for the default transcription layer
        const existing = await newTable.where('[unitId+translationLayerId]').equals([utt.id, 'default']).first();
        if (!existing) {
          const now = new Date().toISOString();
          await newTable.put({
            id: `ut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            unitId: utt.id,
            translationLayerId: 'default',
            modality: 'text',
            text: defaultText,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // 3. Strip transcription field from units
      const cleaned = allUnits.map(({ transcription, ...rest }) => rest);
      if (cleaned.length > 0) {
        await unitsTable.bulkPut(cleaned);
      }
    });

    // v11: Add textId to translation_layers (scope layers per text)
    this.version(11).stores({
      translation_layers: 'id, textId, key, languageId, updatedAt, layerType',
    }).upgrade(async (tx: Transaction) => {
      const layersTable = tx.table('translation_layers');
      const allLayers = (await layersTable.toArray()) as LayerDocType[];
      if (allLayers.length === 0) return;

      const unitsTable = tx.table('units');
      const textsTable = tx.table('texts');
      const unitTextsTable = tx.table('unit_texts');
      const allUnits = (await unitsTable.toArray()) as LayerUnitDocType[];
      const distinctTextIds = [
        ...new Set(
          allUnits
            .map((u) => u.textId)
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
        ),
      ];
      const firstText = (await textsTable.toCollection().first()) as { id: string } | undefined;
      const fallbackTextId = distinctTextIds[0] ?? firstText?.id;
      if (!fallbackTextId) return; // No text in DB — layers will need manual fix

      type UnitTextRow = { unitId?: string; translationLayerId?: string };
      const resolveTextIdForLayer = async (layer: LayerDocType): Promise<string> => {
        if (distinctTextIds.length <= 1) {
          return fallbackTextId;
        }
        try {
          const rows = (await unitTextsTable
            .filter((row: UnitTextRow) => row.translationLayerId === layer.key)
            .toArray()) as UnitTextRow[];
          const counts = new Map<string, number>();
          for (const row of rows) {
            const unit = allUnits.find((u) => u.id === row.unitId);
            const tid = unit?.textId;
            if (typeof tid === 'string' && tid.trim().length > 0) {
              counts.set(tid, (counts.get(tid) ?? 0) + 1);
            }
          }
          const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          if (ranked.length > 0) return ranked[0]![0];
        } catch (err) {
          if (isDexieIndexedQueryFallbackError(err)) {
            reportDexieIndexedQueryFallback('migrations:v11:resolveTextIdForLayer:unit_texts', err);
          } else {
            reportUnexpectedDexieQueryError('migrations:v11:resolveTextIdForLayer:unit_texts', err);
          }
          // unit_texts 读失败时仍退回单值 textId，保证迁移能完成 | Fall back so migration can finish
        }
        return fallbackTextId;
      };

      const updated: LayerDocType[] = [];
      for (const layer of allLayers) {
        const textId = await resolveTextIdForLayer(layer);
        updated.push({ ...layer, textId });
      }
      await layersTable.bulkPut(updated);
    });

    // v12: Fully merge layer system into tier_definitions and remove translation_layers table
    this.version(12).stores({
      translation_layers: null,
      tier_definitions: 'id, textId, key, parentTierId, tierType, contentType',
    }).upgrade(async (tx: Transaction) => {
      const layersTable = tx.table('translation_layers');
      const tiersTable = tx.table('tier_definitions');
      const annotationsTable = tx.table('tier_annotations');

      const layers: LayerDocType[] = await layersTable.toArray();
      if (layers.length === 0) return;

      for (const layer of layers) {
        const bridgeId = resolveBridgeId(layer);
        const bridgeKey = `${BRIDGE_TIER_PREFIX}${layer.key}`;
        const existingTier = await tiersTable
          .filter((t: TierDefinitionDocType) => t.textId === layer.textId && t.key === bridgeKey)
          .first();

        const mergedTier: TierDefinitionDocType = {
          ...(existingTier ?? {
            tierType: 'time-aligned',
            contentType: layer.layerType,
            createdAt: layer.createdAt,
          }),
          id: layer.id,
          textId: layer.textId,
          key: bridgeKey,
          name: layer.name,
          languageId: layer.languageId,
          ...(layer.orthographyId !== undefined && { orthographyId: layer.orthographyId }),
          ...(bridgeId !== undefined && { bridgeId }),
          contentType: layer.layerType,
          modality: layer.modality,
          acceptsAudio: layer.acceptsAudio,
          isDefault: layer.isDefault,
          accessRights: layer.accessRights,
          sortOrder: layer.sortOrder,
          createdAt: existingTier?.createdAt ?? layer.createdAt,
          updatedAt: layer.updatedAt,
        };

        await tiersTable.put(mergedTier);

        if (existingTier && existingTier.id !== layer.id) {
          const oldTierId = existingTier.id;

          const tierAnnotations = await annotationsTable.where('tierId').equals(oldTierId).toArray();
          if (tierAnnotations.length > 0) {
            await annotationsTable.bulkPut(
              tierAnnotations.map((ann: TierAnnotationDocType) => ({ ...ann, tierId: layer.id })),
            );
          }

          const childTiers = await tiersTable.where('parentTierId').equals(oldTierId).toArray();
          if (childTiers.length > 0) {
            await tiersTable.bulkPut(
              childTiers.map((tier: TierDefinitionDocType) => ({ ...tier, parentTierId: layer.id })),
            );
          }

          await tiersTable.delete(oldTierId);
        }
      }
    });

    // v13: CAM-Lite morpheme-level data model.
    // Adds optional fields to units (no index change except speakerId):
    //   - speakerId: FK reference to speakers table (replaces freetext `speaker`)
    //   - annotationStatus: coverage depth enum
    //   - words: UnitWord[] with optional Morpheme[] nested structure
    this.version(13).stores({
      units: 'id, textId, startTime, updatedAt, speakerId',
    });
    // No upgrade hook needed — new fields are optional and default to undefined.
    // Existing units remain valid; speakerId index is populated on next save.

    // v14: Schema expansion — F1 schema补全 + 多假设标注 + F29 user_notes扩展
    // - OrthographyDocType: +scriptTag, +conversionRules (F30 预留)
    // - TierAnnotationDocType: +createdBy, +method (provenance), +hypotheses[] (多假设标注)
    // - NoteTargetType: +'word'|'morpheme'|'annotation'
    // - NoteCategory: +'linguistic'|'fieldwork'|'correction'
    // All new fields are optional — no index changes, no upgrade hook needed.
    this.version(14).stores({});

    // v15: Phase A/B foundation — provenance envelope + stable word/morpheme ids.
    this.version(15).stores({}).upgrade(async (tx: Transaction) => {
      const unitsTable = tx.table('units');
      const allUnits: LayerUnitDocType[] = await unitsTable.toArray();
      if (allUnits.length === 0) return;

      let changed = false;
      let wordCounter = 0;
      let morphCounter = 0;
      const nowPart = Date.now();

      const updatedUnits = allUnits.map((unit) => {
        if (!Array.isArray(unit.words) || unit.words.length === 0) return unit;

        let unitChanged = false;
        const nextWords = unit.words.map((word) => {
          const nextWordId = typeof word.id === 'string' && word.id.length > 0
            ? word.id
            : `tok_${nowPart}_${++wordCounter}`;
          if (nextWordId !== word.id) unitChanged = true;

          const nextMorphemes = Array.isArray(word.morphemes)
            ? word.morphemes.map((morpheme) => {
              const nextMorphId = typeof morpheme.id === 'string' && morpheme.id.length > 0
                ? morpheme.id
                : `morph_${nowPart}_${++morphCounter}`;
              if (nextMorphId !== morpheme.id) unitChanged = true;
              return {
                ...morpheme,
                id: nextMorphId,
              };
            })
            : word.morphemes;

          return {
            ...word,
            id: nextWordId,
            ...(Array.isArray(nextMorphemes) ? { morphemes: nextMorphemes } : {}),
          };
        });

        if (!unitChanged) return unit;
        changed = true;
        return {
          ...unit,
          words: nextWords,
        };
      });

      if (changed) {
        await unitsTable.bulkPut(updatedUnits);
      }
    });

    // v16: canonical token/morpheme entities for stable word-level operations.
    this.version(16).stores({
      unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
      unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
    }).upgrade(async (tx: Transaction) => {
      const unitsTable = tx.table('units');
      const tokensTable = tx.table('unit_tokens');
      const morphemesTable = tx.table('unit_morphemes');
      const allUnits: LayerUnitDocType[] = await unitsTable.toArray();
      if (allUnits.length === 0) return;

      const nextTokens: unknown[] = [];
      const nextMorphemes: unknown[] = [];
      let tokenCounter = 0;
      let morphemeCounter = 0;
      const nowSeed = Date.now();

      for (const unit of allUnits) {
        if (!Array.isArray(unit.words) || unit.words.length === 0) continue;
        const createdAt = unit.createdAt;
        const updatedAt = unit.updatedAt;

        for (let wi = 0; wi < unit.words.length; wi++) {
          const word = unit.words[wi]!;
          const tokenId = `tokv16_${nowSeed}_${++tokenCounter}`;

          nextTokens.push({
            id: tokenId,
            textId: unit.textId,
            unitId: unit.id,
            form: word.form,
            ...(word.gloss ? { gloss: word.gloss } : {}),
            ...(word.pos ? { pos: word.pos } : {}),
            ...(word.lexemeId ? { lexemeId: word.lexemeId } : {}),
            tokenIndex: wi,
            ...(word.provenance ? { provenance: word.provenance } : {}),
            createdAt,
            updatedAt,
          });

          if (!Array.isArray(word.morphemes) || word.morphemes.length === 0) continue;
          for (let mi = 0; mi < word.morphemes.length; mi++) {
            const morpheme = word.morphemes[mi]!;
            const morphemeId = `morphv16_${nowSeed}_${++morphemeCounter}`;
            nextMorphemes.push({
              id: morphemeId,
              textId: unit.textId,
              unitId: unit.id,
              tokenId,
              form: morpheme.form,
              ...(morpheme.gloss ? { gloss: morpheme.gloss } : {}),
              ...(morpheme.pos ? { pos: morpheme.pos } : {}),
              ...(morpheme.lexemeId ? { lexemeId: morpheme.lexemeId } : {}),
              morphemeIndex: mi,
              ...(morpheme.provenance ? { provenance: morpheme.provenance } : {}),
              createdAt,
              updatedAt,
            });
          }
        }
      }

      if (nextTokens.length > 0) {
        await tokensTable.bulkPut(nextTokens as unknown as UnitTokenDocType[]);
      }
      if (nextMorphemes.length > 0) {
        await morphemesTable.bulkPut(nextMorphemes as unknown as UnitMorphemeDocType[]);
      }
    });

    // v17: CAM-v2 naming + token-level links + ai/embedding foundational tables.
    this.version(17).stores({
      unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
      unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
      unit_texts: 'id, unitId, tierId, [unitId+tierId], updatedAt',
      corpus_lexicon_links: null,
      token_lexeme_links: 'id, [targetType+targetId], lexemeId, [lexemeId+targetType]',
      layer_links: 'id, transcriptionLayerKey, tierId',
      ai_tasks: 'id, taskType, status, targetId, createdAt, updatedAt',
      embeddings: 'id, sourceType, sourceId, model, contentHash, createdAt',
    });

    // v18: AI conversation persistence for chat panel.
    this.version(18).stores({
      ai_conversations: 'id, textId, updatedAt, archived',
      ai_messages: 'id, conversationId, [conversationId+createdAt], status, updatedAt',
    });

    // v19: index optimization for recent AI tool decision logs.
    this.version(19).stores({
      audit_logs: 'id, collection, documentId, [collection+action], action, timestamp, [collection+field+timestamp]',
    });

    // v20: requestId index for replay/dedup queries.
    this.version(20).stores({
      audit_logs: 'id, collection, documentId, [collection+action], action, timestamp, [collection+field+timestamp], requestId, [collection+field+requestId]',
    });

    // v21: compound index for efficient embedding queries by (sourceType, model).
    // B-08 fix: enables Dexie to use index seek instead of scan + JS filter for model field.
    this.version(21).stores({
      embeddings: 'id, sourceType, sourceId, [sourceType+model], model, contentHash, createdAt',
    });

    // v22: segmentation-v2 foundation tables (independent per-layer boundaries).
    this.version(22).stores({
      layer_segments: 'id, textId, mediaId, layerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId]',
      layer_segment_contents: 'id, textId, segmentId, layerId, [segmentId+layerId], [layerId+updatedAt], sourceType, updatedAt',
      segment_links: 'id, textId, sourceSegmentId, targetSegmentId, [sourceSegmentId+targetSegmentId], linkType, unitId',
    }).upgrade(async (tx: Transaction) => {
      const unitsTable = tx.table('units');
      const unitTextsTable = tx.table('unit_texts');
      const tierDefinitionsTable = tx.table('tier_definitions');
      const layerSegmentsTable = tx.table('layer_segments');
      const layerSegmentContentsTable = tx.table('layer_segment_contents');
      const segmentLinksTable = tx.table('segment_links');

      const units: LayerUnitDocType[] = await unitsTable.toArray();
      if (units.length === 0) return;

      const unitTexts: LayerUnitContentDocType[] = await unitTextsTable.toArray();
      const tiers: TierDefinitionDocType[] = await tierDefinitionsTable.toArray();

      const rows = buildSegmentationV2BackfillRows({
        units,
        unitTexts,
        tiers,
      });

      if (rows.segments.length > 0) {
        await layerSegmentsTable.bulkPut(rows.segments);
      }
      if (rows.contents.length > 0) {
        await layerSegmentContentsTable.bulkPut(rows.contents);
      }
      if (rows.links.length > 0) {
        await segmentLinksTable.bulkPut(rows.links);
      }
    });

    // v23: add layer-level indexes for segment link cleanup and audits.
    this.version(23).stores({
      segment_links: 'id, textId, sourceSegmentId, targetSegmentId, sourceLayerId, targetLayerId, [sourceSegmentId+targetSegmentId], linkType, unitId',
    });

    // v24: rename unit_texts.tierId → layerId, layer_links.tierId → layerId
    // 统一字段命名为 layerId，消除历史 tier/layer 混用 | Unify field naming to layerId, eliminating legacy tier/layer ambiguity
    this.version(24).stores({
      unit_texts: 'id, unitId, layerId, [unitId+layerId], updatedAt',
      layer_links: 'id, transcriptionLayerKey, layerId',
    }).upgrade(async (tx: Transaction) => {
      const unitTextsTable = tx.table('unit_texts');
      await unitTextsTable.toCollection().modify((row: Record<string, unknown>) => {
        if ('tierId' in row) {
          row.layerId = row.tierId;
          delete row.tierId;
        }
      });

      const layerLinksTable = tx.table('layer_links');
      await layerLinksTable.toCollection().modify((row: Record<string, unknown>) => {
        if ('tierId' in row) {
          row.layerId = row.tierId;
          delete row.tierId;
        }
      });
    });

    // v25: 为 layer_segments 添加 unitId 索引，消除 removeUnitCascade 全表扫描
    // Add unitId index to layer_segments, eliminating full table scan in removeUnitCascade
    this.version(25).stores({
      layer_segments: 'id, textId, mediaId, layerId, unitId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId]',
    }).upgrade(async (tx: Transaction) => {
      const layerSegmentsTable = tx.table('layer_segments');

      const prefixes = ['segv2_', 'segv22_'];
      await layerSegmentsTable.toCollection().modify((row: Record<string, unknown>) => {
        if (row.unitId) return; // 已有则跳过 | Skip if already present
        const segmentId = row.id as string;
        const layerId = row.layerId as string;
        for (const prefix of prefixes) {
          const expected = `${prefix}${layerId}_`;
          if (segmentId.startsWith(expected)) {
            const value = segmentId.slice(expected.length).trim();
            if (value.length > 0) {
              row.unitId = value;
              return;
            }
          }
        }
      });
    });

    // v26: track_entities — per-media track display state persisted to DB.
    // Intentional no-op: legacy LocalStorage (`jieyu:track-entity-state:v1`) → Dexie import removed (greenfield; ADR 0008).
    this.version(26).stores({
      track_entities: 'id, textId, mediaId, [textId+mediaId]',
    });

    // v27: Plan B foundation — unified per-layer timeline units.
    // 统一时间单元基座：先回填默认转写层与独立段层，后续逐步替换业务读写。
    this.version(27).stores({
      layer_units: 'id, textId, mediaId, layerId, sourceKind, sourceId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId], [layerId+sourceKind+sourceId]',
    }).upgrade(async (tx: Transaction) => {
      const unitsTable = tx.table('units');
      const tiersTable = tx.table('tier_definitions');
      const layerSegmentsTable = tx.table('layer_segments');
      const layerUnitsTable = tx.table('layer_units');

      const [units, tiers, segments] = await Promise.all([
        unitsTable.toArray() as Promise<LayerUnitDocType[]>,
        tiersTable.toArray() as Promise<TierDefinitionDocType[]>,
        layerSegmentsTable.toArray() as Promise<LayerUnitDocType[]>,
      ]);

      if (units.length === 0 && segments.length === 0) return;

      const defaultTrcByText = new Map<string, TierDefinitionDocType>();
      const trcByText = new Map<string, TierDefinitionDocType[]>();
      for (const tier of tiers) {
        if (tier.contentType !== 'transcription') continue;
        const bucket = trcByText.get(tier.textId);
        if (bucket) bucket.push(tier);
        else trcByText.set(tier.textId, [tier]);
      }
      for (const [textId, bucket] of trcByText.entries()) {
        const sorted = [...bucket].sort((a, b) => {
          const defaultCmp = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
          if (defaultCmp !== 0) return defaultCmp;
          const sortA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const sortB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
          if (sortA !== sortB) return sortA - sortB;
          return a.id.localeCompare(b.id);
        });
        const picked = sorted[0];
        if (picked) defaultTrcByText.set(textId, picked);
      }

      type LayerUnitMigrationRow = {
        id: string;
        textId: string;
        mediaId: string;
        layerId: string;
        sourceKind: 'unit' | 'segment';
        sourceId: string;
        startTime: number;
        endTime: number;
        speakerId?: string;
        startAnchorId?: string;
        endAnchorId?: string;
        ordinal?: number;
        createdAt: string;
        updatedAt: string;
      };

      const rowsById = new Map<string, LayerUnitMigrationRow>();
      for (const utt of units) {
        const defaultTrc = defaultTrcByText.get(utt.textId);
        if (!defaultTrc || !utt.mediaId) continue;
        const id = `lu_${defaultTrc.id}_utt_${utt.id}`;
        rowsById.set(id, {
          id,
          textId: utt.textId,
          mediaId: utt.mediaId,
          layerId: defaultTrc.id,
          sourceKind: 'unit',
          sourceId: utt.id,
          startTime: utt.startTime,
          endTime: utt.endTime,
          ...(utt.speakerId ? { speakerId: utt.speakerId } : {}),
          ...(utt.startAnchorId ? { startAnchorId: utt.startAnchorId } : {}),
          ...(utt.endAnchorId ? { endAnchorId: utt.endAnchorId } : {}),
          ...(typeof utt.ordinal === 'number' ? { ordinal: utt.ordinal } : {}),
          createdAt: utt.createdAt,
          updatedAt: utt.updatedAt,
        });
      }

      for (const seg of segments) {
        const layerId = seg.layerId ?? '';
        const mediaId = seg.mediaId ?? '';
        const id = `lu_${layerId}_seg_${seg.id}`;
        rowsById.set(id, {
          id,
          textId: seg.textId,
          mediaId,
          layerId,
          sourceKind: 'segment',
          sourceId: seg.id,
          startTime: seg.startTime,
          endTime: seg.endTime,
          ...(seg.speakerId ? { speakerId: seg.speakerId } : {}),
          ...(seg.startAnchorId ? { startAnchorId: seg.startAnchorId } : {}),
          ...(seg.endAnchorId ? { endAnchorId: seg.endAnchorId } : {}),
          ...(typeof seg.ordinal === 'number' ? { ordinal: seg.ordinal } : {}),
          createdAt: seg.createdAt,
          updatedAt: seg.updatedAt,
        });
      }

      const rows = [...rowsById.values()];
      if (rows.length > 0) {
        await layerUnitsTable.bulkPut(rows);
      }
    });

    // v28: Backfill unit_texts → layer_segment_contents（Phase 0 去双写安全网）
    // 确保每一条 unit_texts 行都有对应 V2 条目；v22 迁移的条目用 segv22_ 前缀，
    // 后续 BridgeService 写入的用 segv2_ 前缀，此处按 content ID 幂等补全。
    // Ensure every unit_texts row has a corresponding V2 entry. Idempotent by content ID.
    this.version(28).stores({}).upgrade(async (tx: Transaction) => {
      const unitTextsTable = tx.table('unit_texts');
      const unitsTable     = tx.table('units');
      const layerSegmentsTable  = tx.table('layer_segments');
      const layerSegmentContentsTable = tx.table('layer_segment_contents');

      const [allTexts, allUnits, existingContents, existingSegmentIds] = await Promise.all([
        unitTextsTable.toArray() as Promise<LayerUnitContentDocType[]>,
        unitsTable.toArray()     as Promise<LayerUnitDocType[]>,
        layerSegmentContentsTable.toArray() as Promise<LayerUnitContentDocType[]>,
        (layerSegmentsTable.toCollection().primaryKeys()) as Promise<string[]>,
      ]);

      if (allTexts.length === 0) return;

      const unitById = new Map(allUnits.map((u: LayerUnitDocType) => [u.id, u]));
      const existingContentById = new Map(existingContents.map((c: LayerUnitContentDocType) => [c.id, c]));
      const existingSegmentIdSet = new Set(existingSegmentIds);
      const now = new Date().toISOString();

      const BATCH_SIZE = 200;
      const segmentBatch: LayerUnitDocType[] = [];
      const contentBatch: LayerUnitContentDocType[] = [];

      for (const text of allTexts) {
        const unitId = text.unitId?.trim();
        if (!unitId) continue;
        const utt = unitById.get(unitId);
        if (!utt) continue; // 孤立 text，跳过 | orphan text, skip
        const existingContent = existingContentById.get(text.id);

        // 修复分支：若 content 存在但 segment 丢失，重建 canonical segment 并回指 | Repair branch: rebuild canonical segment when content exists but segment is missing
        const plan = buildV28BackfillPlanForText({
          text,
          unit: utt,
          nowIso: now,
          ...(existingContent !== undefined
            ? { existingContent }
            : {}),
          segmentExists: (segmentId) => existingSegmentIdSet.has(segmentId),
        });
        if (!plan) continue;

        segmentBatch.push(plan.segment);
        contentBatch.push(plan.content);
        existingSegmentIdSet.add(plan.segment.id);
        existingContentById.set(plan.content.id, plan.content);

        // 分批写入避免 IndexedDB 单事务过大 | Batch write to avoid oversized transactions
        if (segmentBatch.length >= BATCH_SIZE) {
          await layerSegmentsTable.bulkPut(segmentBatch);
          await layerSegmentContentsTable.bulkPut(contentBatch);
          segmentBatch.length = 0;
          contentBatch.length = 0;
        }
      }

      // 写入剩余 | Flush remaining
      if (segmentBatch.length > 0) {
        await layerSegmentsTable.bulkPut(segmentBatch);
        await layerSegmentContentsTable.bulkPut(contentBatch);
      }
    });

    // v29: V2 single-source-of-truth cutoff — drop legacy unit_texts table.
    this.version(29).stores({
      unit_texts: null,
    });

    /*
     * Historical chain v30–v40 (Dexie versions are monotonic; do not delete or reorder blocks):
     * v30 introduced layer_units + layer_unit_contents + unit_relations; v31 removed legacy segmentation
     * tables; v32 set layer_units to null (data loss window for DBs that had v30 data); v33–v36 added
     * orthography / language catalog / units index churn; v37 M18 cutover; v38–v39 read-model tables;
     * v40 restored canonical layer_units. New installs use `JIEYU_DEXIE_DB_NAME` (greenfield); treat v32
     * as lineage-only when reasoning about empty historical stores.
     */
    // v30: unified layer unit foundation tables.
    // 统一层单元基座表：为单实体多轴模型提供正式 schema，暂不回填旧数据。
    this.version(30).stores({
      layer_units: 'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
      layer_unit_contents: 'id, textId, unitId, layerId, contentRole, [unitId+contentRole], [contentRole+updatedAt], sourceType, [layerId+updatedAt], updatedAt',
      unit_relations: 'id, textId, sourceUnitId, targetUnitId, relationType, [sourceUnitId+relationType], [targetUnitId+relationType]',
    });

    // v31: retire legacy segmentation tables after LayerUnit convergence.
    // LayerUnit 已成为唯一真源，物理移除 legacy segmentation 真表。
    this.version(31).stores({
      layer_segments: null,
      layer_segment_contents: null,
      segment_links: null,
    });

    // v32: layer_units null (see v30–v40 historical note above).
    this.version(32).stores({
      layer_units: null,
    });

    // v33: orthography bridge registry.
    // 正字法转换注册表：为 source->target 转换规则、样例与状态提供独立存储。
    this.version(33).stores({
      orthography_transforms: 'id, sourceOrthographyId, targetOrthographyId, [sourceOrthographyId+targetOrthographyId], engine, status, updatedAt',
    });

    // v34: language asset catalog tables.
    // 语言资产目录底座：语言主表 + 名称矩阵 + 别名 + 审计历史。
    this.version(34).stores({
      languages: 'id, languageCode, canonicalTag, iso6393, sourceType, reviewStatus, visibility, family, macrolanguage, updatedAt',
      language_display_names: 'id, languageId, locale, role, [languageId+locale], [languageId+role], [languageId+locale+role], [locale+value], updatedAt',
      language_aliases: 'id, languageId, normalizedAlias, aliasType, locale, [languageId+normalizedAlias], [normalizedAlias+languageId], [languageId+aliasType], updatedAt',
      language_catalog_history: 'id, languageId, action, createdAt, [languageId+createdAt]',
    });

    // v35: custom field definitions table + customFields JSON blob on languages.
    // 自定义字段定义表 + 语言主表上的 customFields JSON 扩展字段。无需迁移。
    this.version(35).stores({
      custom_field_definitions: 'id, sortOrder, updatedAt',
    });

    // v36: 恢复 units 的 mediaId 单字段索引（v13 重声明时意外丢失）
    // Restore standalone mediaId index on units (accidentally dropped by v13 redeclaration)
    this.version(36).stores({
      units: 'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt, speakerId',
    });

    // v37: M18 — units → layer_units; token/morpheme unitId → unitId; drop units store.
    this.version(37).stores({
      units: null,
      unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
      unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
    }).upgrade(async (tx: Transaction) => {
      await upgradeM18LinguisticUnitCutover(tx);
    });

    // v38: unified SegmentMeta read model for sidebar filters and future AI metadata prefiltering.
    this.version(38).stores({
      segment_meta: 'id, segmentId, unitKind, textId, mediaId, layerId, hostUnitId, effectiveSpeakerId, effectiveSelfCertainty, annotationStatus, *noteCategoryKeys, [layerId+mediaId], [textId+layerId], [layerId+updatedAt], updatedAt',
    });

    // v39: project-wide read-model snapshots for quality, scope stats, speakers, translation, language assets, and AI task dashboards.
    this.version(39).stores({
      segment_quality_snapshots: 'id, segmentId, textId, mediaId, layerId, severity, [layerId+mediaId], [textId+layerId], [layerId+severity], updatedAt',
      scope_stats_snapshots: 'id, scopeType, scopeKey, textId, mediaId, layerId, speakerId, [scopeType+scopeKey], [textId+scopeType], updatedAt',
      speaker_profile_snapshots: 'id, textId, speakerId, [textId+speakerId], updatedAt',
      translation_status_snapshots: 'id, unitId, textId, mediaId, layerId, status, [layerId+mediaId], [textId+layerId], updatedAt',
      language_asset_overviews: 'id, languageId, displayName, aliasCount, orthographyCount, bridgeCount, updatedAt',
      ai_task_snapshots: 'id, taskId, taskType, status, targetId, updatedAt',
    });

    // v40: restore layer_units store (see v30–v40 historical note above).
    this.version(40).stores({
      layer_units: 'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
    });

    /*
     * v41: one-shot lazy migration for self-certainty cross-layer contamination cleanup.
     *   历史 controller 把 segment 菜单的 selfCertainty 写到 parent canonical unit 上；
     *   新语义不再向 host 回退读/写。本迁移做 additive 下刷：
     *   可唯一消歧的段（一层内一个段引用同一 host）→ 把 host 的值复制到该段；其余不动。
     *   详见 src/db/migrations/m41SelfCertaintyHostDepollute.ts 顶端注释。
     *
     *   One-shot Dexie upgrade that best-effort restores hidden self-certainty values after the
     *   controller flip. See the migration file for detailed rules; never overwrites existing
     *   segment values and never clears host fields.
     */
    this.version(41).stores({}).upgrade(async (tx) => {
      await upgradeM41SelfCertaintyHostDepollute(tx);
    });

    // v42: track_entities — stable id `te:${textId}:${trackKey}` (replaces legacy `track_${...}` collisions).
    this.version(42).stores({}).upgrade(async (tx) => {
      await upgradeM42TrackEntityDocumentIds(tx);
    });

    // v43: layer_links host id bridge index + one-shot backfill from transcriptionLayerKey.
    // New schema bump: 同步更新本文件 `JIEYU_DEXIE_TARGET_SCHEMA_VERSION` 与 `src/db/migrations/jieyuDexieOpenReplay.test.ts`。
    this.version(43).stores({
      layer_links: 'id, transcriptionLayerKey, hostTranscriptionLayerId, layerId, [layerId+hostTranscriptionLayerId]',
    }).upgrade(async (tx) => {
      const layerLinksTable = tx.table('layer_links');
      const tiersTable = tx.table('tier_definitions');
      const tiers = await tiersTable.toArray();
      const transcriptionKeyToId = new Map<string, string>();

      for (const tier of tiers as Array<Record<string, unknown>>) {
        const key = typeof tier.key === 'string' ? tier.key.trim() : '';
        const id = typeof tier.id === 'string' ? tier.id.trim() : '';
        const contentType = typeof tier.contentType === 'string' ? tier.contentType : '';
        if (!key || !id || contentType !== 'transcription') continue;
        if (!transcriptionKeyToId.has(key)) {
          transcriptionKeyToId.set(key, id);
        }
      }

      await layerLinksTable.toCollection().modify((row: Record<string, unknown>) => {
        if (typeof row.hostTranscriptionLayerId === 'string' && row.hostTranscriptionLayerId.trim().length > 0) {
          return;
        }
        const key = typeof row.transcriptionLayerKey === 'string' ? row.transcriptionLayerKey.trim() : '';
        if (!key) return;
        const hostId = transcriptionKeyToId.get(key);
        if (!hostId) return;
        row.hostTranscriptionLayerId = hostId;
      });
    });

    // v44: structural rule profile language assets for configurable Leipzig-like parsing.
    this.version(44).stores({
      structural_rule_profiles: 'id, scope, languageId, projectId, enabled, priority, updatedAt',
    });
  }
}

type GlobalWithJieyuDb = typeof globalThis & {
  __jieyuDbPromise__?: Promise<JieyuDatabase>;
  __jieyuDexie__?: JieyuDexie;
};

const globalWithDb = globalThis as GlobalWithJieyuDb;

function getOrCreateDexie(): JieyuDexie {
  if (!globalWithDb.__jieyuDexie__) {
    globalWithDb.__jieyuDexie__ = new JieyuDexie(JIEYU_DEXIE_DB_NAME);
  }
  return globalWithDb.__jieyuDexie__;
}



export type JieyuDatabase = {
  name: string;
  dexie: JieyuDexie;
  collections: JieyuCollections;
  close: () => Promise<void>;
};

const BACKUP_REMINDER_HOOK_TABLES = ['layer_units', 'layer_unit_contents', 'tier_annotations'] as const;

function registerIndexedDbMutationBackupHooks(dexie: JieyuDexie): void {
  const tagged = dexie as unknown as { __jieyuBackupHooksRegistered?: boolean };
  if (tagged.__jieyuBackupHooksRegistered) {
    return;
  }
  tagged.__jieyuBackupHooksRegistered = true;
  const onMutate = () => {
    markBackupDirtySinceLastExport();
  };
  for (const tableName of BACKUP_REMINDER_HOOK_TABLES) {
    const table = dexie.table(tableName);
    table.hook('creating', onMutate);
    table.hook('updating', onMutate);
    table.hook('deleting', onMutate);
  }
}

export class JieyuDatabaseOpenError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly recoveryHint: 'corrupted' | 'blocked' | 'unknown',
  ) {
    super(message);
    this.name = 'JieyuDatabaseOpenError';
  }
}

function dispatchDatabaseOpenFailureEvent(reason: JieyuDatabaseOpenError): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jieyu:db-open-failed', { detail: reason }));
    }
  } catch {
    // 事件派发失败不应阻断错误抛出 | Event dispatch failure must not swallow the DB error
  }
}

/**
 * ARCH-5: 读取已存储的 IndexedDB 版本号，用于判断是否需要迁移。
 * 优先用 `indexedDB.databases()` API（兼容主流桌面浏览器）；不可用时返回 0（不展示进度条）。
 * ARCH-5: Read stored IndexedDB version to detect if schema migration is needed.
 * Uses `indexedDB.databases()` where available; returns 0 on failure (no progress overlay).
 */
async function readCurrentIdbVersion(dbName: string): Promise<number> {
  try {
    if (typeof indexedDB === 'undefined') return 0;
    if (typeof (indexedDB as { databases?: () => Promise<IDBDatabaseInfo[]> }).databases === 'function') {
      const dbs = await (indexedDB as { databases: () => Promise<IDBDatabaseInfo[]> }).databases();
      return dbs.find((d) => d.name === dbName)?.version ?? 0;
    }
  } catch {
    // 读取版本失败时降级为不展示进度条 | Degrade gracefully: skip migration overlay on error
  }
  return 0;
}

function dispatchDbMigrationStartEvent(detail: { from: number; to: number }): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jieyu:db-migrating', { detail }));
    }
  } catch { /* silent */ }
}

function dispatchDbMigrationDoneEvent(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jieyu:db-migration-done'));
    }
  } catch { /* silent */ }
}

async function _createDb(): Promise<JieyuDatabase> {
  const dexie = getOrCreateDexie();
  // ARCH-5: 迁移前检查当前版本，决定是否展示进度覆盖层 | Check current version before migration to show progress overlay
  const currentVersion = await readCurrentIdbVersion(JIEYU_DEXIE_DB_NAME);
  const migrationNeeded = currentVersion > 0 && currentVersion < JIEYU_DEXIE_TARGET_SCHEMA_VERSION;
  if (migrationNeeded) {
    dispatchDbMigrationStartEvent({ from: currentVersion, to: JIEYU_DEXIE_TARGET_SCHEMA_VERSION });
    // ARCH-5 实际收口：迁移前自动快照（独立备份库），失败不阻断升级但会重试。
    // ARCH-5 closure: create a pre-migration snapshot in a dedicated backup DB; failures are best-effort.
    await createPreMigrationBackupSnapshot({
      dbName: JIEYU_DEXIE_DB_NAME,
      fromVersion: currentVersion,
      toVersion: JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
    });
  }
  try {
    await dexie.open();
  } catch (err) {
    let recoveryHint: JieyuDatabaseOpenError['recoveryHint'] = 'unknown';
    let message = '无法打开本地数据库，数据可能已损坏。';
    if (err instanceof DOMException) {
      if (err.name === 'AbortError' || err.name === 'UnknownError') {
        recoveryHint = 'corrupted';
        message = '数据库文件损坏或浏览器版本不支持，建议导出备份后重置。';
      }
    } else if (err instanceof Error) {
      if (err.message.includes('blocked')) {
        recoveryHint = 'blocked';
        message = '数据库被其他标签页占用，请关闭其他解语窗口后刷新。';
      }
    }
    const openError = new JieyuDatabaseOpenError(message, err, recoveryHint);
    dispatchDatabaseOpenFailureEvent(openError);
    if (migrationNeeded) {
      // 迁移失败时也需要关闭进度遮罩 | Also dismiss the migration overlay on failure
      dispatchDbMigrationDoneEvent();
    }
    delete globalWithDb.__jieyuDbPromise__;
    throw openError;
  }
  if (migrationNeeded) {
    dispatchDbMigrationDoneEvent();
  }
  registerIndexedDbMutationBackupHooks(dexie);

  const collections: JieyuCollections = {
    texts: new DexieCollectionAdapter(dexie.texts, validateTextDoc),
    media_items: new DexieCollectionAdapter(dexie.media_items, validateMediaItemDoc),
    unit_tokens: new DexieCollectionAdapter(dexie.unit_tokens, validateUnitTokenDoc),
    unit_morphemes: new DexieCollectionAdapter(dexie.unit_morphemes, validateUnitMorphemeDoc),
    anchors: new DexieCollectionAdapter(dexie.anchors, validateAnchorDoc),
    lexemes: new DexieCollectionAdapter(dexie.lexemes, validateLexemeDoc),
    token_lexeme_links: new DexieCollectionAdapter(
      dexie.token_lexeme_links,
      validateTokenLexemeLinkDoc,
    ),
    ai_tasks: new DexieCollectionAdapter(dexie.ai_tasks, validateAiTaskDoc),
    embeddings: new DexieCollectionAdapter(dexie.embeddings, validateEmbeddingDoc),
    ai_conversations: new DexieCollectionAdapter(
      dexie.ai_conversations,
      validateAiConversationDoc,
    ),
    ai_messages: new DexieCollectionAdapter(dexie.ai_messages, validateAiMessageDoc),
    languages: new DexieCollectionAdapter(dexie.languages, validateLanguageDoc),
    language_display_names: new DexieCollectionAdapter(dexie.language_display_names, validateLanguageDisplayNameDoc),
    language_aliases: new DexieCollectionAdapter(dexie.language_aliases, validateLanguageAliasDoc),
    language_catalog_history: new DexieCollectionAdapter(dexie.language_catalog_history, validateLanguageCatalogHistoryDoc),
    custom_field_definitions: new DexieCollectionAdapter(dexie.custom_field_definitions, validateCustomFieldDefinitionDoc),
    speakers: new DexieCollectionAdapter(dexie.speakers, validateSpeakerDoc),
    orthographies: new DexieCollectionAdapter(dexie.orthographies, validateOrthographyDoc),
    orthography_bridges: new DexieCollectionAdapter(dexie.orthography_bridges, validateOrthographyBridgeDoc),
    locations: new DexieCollectionAdapter(dexie.locations, validateLocationDoc),
    bibliographic_sources: new DexieCollectionAdapter(
      dexie.bibliographic_sources,
      validateBibliographicSourceDoc,
    ),
    grammar_docs: new DexieCollectionAdapter(dexie.grammar_docs, validateGrammarDoc),
    abbreviations: new DexieCollectionAdapter(dexie.abbreviations, validateAbbreviationDoc),
    structural_rule_profiles: new DexieCollectionAdapter(dexie.structural_rule_profiles, validateStructuralRuleProfileAssetDoc),
    phonemes: new DexieCollectionAdapter(dexie.phonemes, validatePhonemeDoc),
    tag_definitions: new DexieCollectionAdapter(
      dexie.tag_definitions,
      validateTagDefinitionDoc,
    ),
    layers: new TierBackedLayerCollectionAdapter(
      dexie.tier_definitions,
      validateLayerDoc,
    ),
    layer_units: new DexieCollectionAdapter(
      dexie.layer_units,
      validateLayerUnitDoc,
    ),
    layer_unit_contents: new DexieCollectionAdapter(
      dexie.layer_unit_contents,
      validateLayerUnitContentDoc,
    ),
    unit_relations: new DexieCollectionAdapter(
      dexie.unit_relations,
      validateUnitRelationDoc,
    ),
    layer_links: new DexieCollectionAdapter(dexie.layer_links, validateLayerLinkDoc),
    tier_definitions: new DexieCollectionAdapter(dexie.tier_definitions, validateTierDefinitionDoc),
    tier_annotations: new DexieCollectionAdapter(dexie.tier_annotations, validateTierAnnotationDoc),
    audit_logs: new DexieCollectionAdapter(dexie.audit_logs, validateAuditLogDoc),
    user_notes: new DexieCollectionAdapter(dexie.user_notes, validateUserNoteDoc),
    segment_meta: new DexieCollectionAdapter(dexie.segment_meta, validateSegmentMetaDoc),
    segment_quality_snapshots: new DexieCollectionAdapter(dexie.segment_quality_snapshots, validateSegmentQualitySnapshotDoc),
    scope_stats_snapshots: new DexieCollectionAdapter(dexie.scope_stats_snapshots, validateScopeStatsSnapshotDoc),
    speaker_profile_snapshots: new DexieCollectionAdapter(dexie.speaker_profile_snapshots, validateSpeakerProfileSnapshotDoc),
    translation_status_snapshots: new DexieCollectionAdapter(dexie.translation_status_snapshots, validateTranslationStatusSnapshotDoc),
    language_asset_overviews: new DexieCollectionAdapter(dexie.language_asset_overviews, validateLanguageAssetOverviewDoc),
    ai_task_snapshots: new DexieCollectionAdapter(dexie.ai_task_snapshots, validateAiTaskSnapshotDoc),
    track_entities: new DexieCollectionAdapter(dexie.track_entities, validateTrackEntityDoc),
  };

  return {
    name: dexie.name,
    dexie,
    collections,
    close: async () => {
      dexie.close();
    },
  };
}


export function getDb(): Promise<JieyuDatabase> {
  if (!globalWithDb.__jieyuDbPromise__) {
    globalWithDb.__jieyuDbPromise__ = _createDb().catch((error) => {
      delete globalWithDb.__jieyuDbPromise__;
      throw error;
    });
  }
  return globalWithDb.__jieyuDbPromise__;
}

/**
 * 测试 / 开发场景：关闭 `getDb()` 缓存的 `JieyuDatabase` 与底层 Dexie，并清空单例 Promise。下一次 `getDb()` 会重新 `_createDb()`；`import { db } from '…/db'` 仍指向同一 Dexie 单例，测试里通常应再 `await db.open()`。生产路径勿调用。
 * Tests/dev: clear `getDb` memo + close underlying Dexie. Next `getDb()` rebuilds `JieyuDatabase`; the `db` import remains the same Dexie instance; call `await db.open()` in tests as needed. Do not use in production.
 */
export async function resetJieyuDatabaseSingletonForTests(): Promise<void> {
  if (globalWithDb.__jieyuDbPromise__) {
    try {
      const jieyu = await globalWithDb.__jieyuDbPromise__;
      await jieyu.close();
    } catch {
      // ignore: rejected init or double-close
    }
    delete globalWithDb.__jieyuDbPromise__;
  }
  const dexie = getOrCreateDexie();
  if (dexie.isOpen()) {
    try {
      dexie.close();
    } catch {
      // ignore
    }
  }
}

export const db = getOrCreateDexie();
