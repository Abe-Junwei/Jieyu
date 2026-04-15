/**
 * Dexie 数据库引擎 | Dexie database engine
 *
 * JieyuDexie: 带完整 schema 版本链的 Dexie 子类
 * Migration helpers: v22/v28 回填辅助函数
 * Instance: 单例管理与 JieyuDatabase 工厂
 */
import Dexie, { type Table, type Transaction } from 'dexie';
import type {
  TextDocType, MediaItemDocType, UtteranceDocType, UtteranceTokenDocType,
  UtteranceMorphemeDocType, AnchorDocType, LexemeDocType, TokenLexemeLinkDocType,
  AiTaskDoc, EmbeddingDoc, AiConversationDoc, AiMessageDoc,
  LanguageDocType, LanguageDisplayNameDocType, LanguageAliasDocType,
  LanguageCatalogHistoryDocType, CustomFieldDefinitionDocType,
  SpeakerDocType, OrthographyDocType, OrthographyBridgeDocType,
  LocationDocType, BibliographicSourceDocType, GrammarDocDocType,
  AbbreviationDocType, PhonemeDocType, TagDefinitionDocType,
  LayerDocType, LayerUnitDocType, LayerUnitContentDocType,
  UnitRelationDocType, LayerLinkDocType,
  TierDefinitionDocType, TierAnnotationDocType,
  AuditLogDocType, UserNoteDocType, TrackEntityDocType,
  UtteranceTextDocType, LayerSegmentDocType, LayerSegmentContentDocType,
  SegmentLinkDocType,
  SegmentationV2BackfillRows, V28BackfillPlan,
  JieyuCollections,
} from './types';
import {
  validateTextDoc, validateMediaItemDoc,
  validateUtteranceTokenDoc, validateUtteranceMorphemeDoc,
  validateAnchorDoc, validateLexemeDoc, validateTokenLexemeLinkDoc,
  validateAiTaskDoc, validateEmbeddingDoc,
  validateAiConversationDoc, validateAiMessageDoc,
  validateLanguageDoc, validateLanguageDisplayNameDoc,
  validateLanguageAliasDoc, validateLanguageCatalogHistoryDoc,
  validateCustomFieldDefinitionDoc,
  validateSpeakerDoc, validateOrthographyDoc, validateOrthographyBridgeDoc,
  validateLocationDoc, validateBibliographicSourceDoc,
  validateGrammarDoc, validateAbbreviationDoc,
  validatePhonemeDoc, validateTagDefinitionDoc,
  validateLayerDoc, validateLayerUnitDoc, validateLayerUnitContentDoc,
  validateUnitRelationDoc, validateLayerLinkDoc,
  validateTierDefinitionDoc, validateTierAnnotationDoc,
  validateAuditLogDoc, validateUserNoteDoc, validateTrackEntityDoc,
} from './schemas';
import {
  DexieCollectionAdapter, TierBackedLayerCollectionAdapter,
  resolveBridgeId, BRIDGE_TIER_PREFIX,
} from './adapter';
import { upgradeM18LinguisticUtteranceCutover } from './migrations/m18LinguisticUtteranceCutover';

const JIEYU_DB_NAME = 'jieyudb';

export function buildSegmentationV2BackfillRows(input: {
  utterances: UtteranceDocType[];
  utteranceTexts: UtteranceTextDocType[];
  tiers: TierDefinitionDocType[];
  nowIso?: string;
}): SegmentationV2BackfillRows {
  const { utterances, utteranceTexts, tiers, nowIso } = input;
  if (utterances.length === 0) {
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

  const buildSegmentId = (layerId: string, utteranceId: string) => `segv22_${layerId}_${utteranceId}`;
  const buildContentId = (utteranceTextId: string) => utteranceTextId;
  const buildLinkId = (layerId: string, utteranceId: string) => `seglv22_${layerId}_${utteranceId}`;

  const segmentById = new Map<string, LayerSegmentDocType>();
  const contentById = new Map<string, LayerSegmentContentDocType>();
  const linkById = new Map<string, SegmentLinkDocType>();
  const utteranceById = new Map(utterances.map((item) => [item.id, item]));

  const ensureSegment = (
    utterance: UtteranceDocType,
    layerId: string,
  ): LayerSegmentDocType => {
    const segmentId = buildSegmentId(layerId, utterance.id);
    const existing = segmentById.get(segmentId);
    if (existing) return existing;

    const next: LayerSegmentDocType = {
      id: segmentId,
      textId: utterance.textId,
      mediaId: utterance.mediaId && utterance.mediaId.trim().length > 0 ? utterance.mediaId : '__unknown_media__',
      layerId,
      utteranceId: utterance.id,
      startTime: utterance.startTime,
      endTime: utterance.endTime,
      ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
      ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
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

  for (const utterance of utterances) {
    const baseLayerId = transcriptionTierByTextId.get(utterance.textId);
    if (!baseLayerId) continue;
    ensureSegment(utterance, baseLayerId);
  }

  // v22 迁移数据可能仍含 tierId 而非 layerId | v22 migration data may still have tierId instead of layerId
  const getRowLayerId = (row: UtteranceTextDocType): string =>
    ((row as unknown as Record<string, unknown>).tierId as string | undefined) ?? row.layerId;

  for (const row of utteranceTexts) {
    const utterance = utteranceById.get(row.utteranceId);
    if (!utterance) continue;

    const rowLayerId = getRowLayerId(row);
    const targetSegment = ensureSegment(utterance, rowLayerId);
    const contentId = buildContentId(row.id);

    contentById.set(contentId, {
      id: contentId,
      textId: utterance.textId,
      segmentId: targetSegment.id,
      layerId: rowLayerId,
      modality: row.modality,
      ...(row.text !== undefined ? { text: row.text } : {}),
      ...(row.translationAudioMediaId ? { translationAudioMediaId: row.translationAudioMediaId } : {}),
      sourceType: row.sourceType,
      ...(row.ai_metadata ? { ai_metadata: row.ai_metadata } : {}),
      ...(row.provenance ? { provenance: row.provenance } : {}),
      ...(row.accessRights ? { accessRights: row.accessRights } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    const baseLayerId = transcriptionTierByTextId.get(utterance.textId);
    if (!baseLayerId || baseLayerId === rowLayerId) continue;

    const sourceSegmentId = buildSegmentId(baseLayerId, utterance.id);
    const linkId = buildLinkId(rowLayerId, utterance.id);
    linkById.set(linkId, {
      id: linkId,
      textId: utterance.textId,
      sourceSegmentId,
      targetSegmentId: targetSegment.id,
      sourceLayerId: baseLayerId,
      targetLayerId: rowLayerId,
      utteranceId: utterance.id,
      linkType: 'bridge',
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
  text: UtteranceTextDocType;
  utterance: UtteranceDocType;
  nowIso: string;
  existingContent?: LayerSegmentContentDocType;
  segmentExists: (segmentId: string) => boolean;
}): V28BackfillPlan | null {
  const { text, utterance, nowIso, existingContent, segmentExists } = input;
  const canonicalSegmentId = `segv2_${text.layerId}_${utterance.id}`;

  if (existingContent && segmentExists(existingContent.segmentId)) {
    return null;
  }

  const segment: LayerSegmentDocType = {
    id: canonicalSegmentId,
    textId: utterance.textId,
    mediaId: utterance.mediaId && utterance.mediaId.trim().length > 0 ? utterance.mediaId : '__unknown_media__',
    layerId: text.layerId,
    utteranceId: utterance.id,
    startTime: utterance.startTime,
    endTime: utterance.endTime,
    ...(utterance.startAnchorId ? { startAnchorId: utterance.startAnchorId } : {}),
    ...(utterance.endAnchorId ? { endAnchorId: utterance.endAnchorId } : {}),
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

  const content: LayerSegmentContentDocType = {
    id: text.id,
    textId: utterance.textId,
    segmentId: canonicalSegmentId,
    layerId: text.layerId,
    modality: text.modality,
    ...(text.text !== undefined ? { text: text.text } : {}),
    ...(text.translationAudioMediaId ? { translationAudioMediaId: text.translationAudioMediaId } : {}),
    sourceType: text.sourceType,
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
  utterance_tokens!: Table<UtteranceTokenDocType, string>;
  utterance_morphemes!: Table<UtteranceMorphemeDocType, string>;
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
  track_entities!: Table<TrackEntityDocType, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      utterances: 'id, textId, startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, utteranceId, lexemeId',
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
      utterance_translations: 'id, utteranceId, translationLayerId, updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(2).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      utterances: 'id, textId, mediaId, [mediaId+startTime], startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, utteranceId, lexemeId',
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
      utterance_translations: 'id, utteranceId, translationLayerId, updatedAt',
      layer_links: 'id, transcriptionLayerKey, translationLayerId',
      tier_definitions: 'id, textId, key, parentTierId, tierType',
      tier_annotations: 'id, tierId, parentAnnotationId, startTime, endTime',
      audit_logs: 'id, collection, documentId, action, timestamp',
    });

    this.version(3).stores({
      texts: 'id, updatedAt, languageCode',
      media_items: 'id, textId, createdAt',
      utterances: 'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt',
      lexemes: 'id, updatedAt',
      annotations: 'id, textId, createdAt',
      corpus_lexicon_links: 'id, utteranceId, lexemeId',
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
      utterance_translations: 'id, utteranceId, translationLayerId, [utteranceId+translationLayerId], updatedAt',
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
      const utterancesTable = tx.table('utterances');
      const anchorsTable = tx.table('anchors');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();

      if (allUtterances.length === 0) return;

      const now = new Date().toISOString();
      let anchorCounter = 0;

      const anchorsToInsert: AnchorDocType[] = [];
      const utterancesToUpdate: UtteranceDocType[] = [];

      for (const u of allUtterances) {
        const mediaId = u.mediaId ?? '';
        const startAnchorId = `anc_${Date.now()}_${++anchorCounter}`;
        const endAnchorId = `anc_${Date.now()}_${++anchorCounter}`;
        anchorsToInsert.push(
          { id: startAnchorId, mediaId, time: u.startTime, createdAt: now },
          { id: endAnchorId, mediaId, time: u.endTime, createdAt: now },
        );
        utterancesToUpdate.push({
          ...u,
          startAnchorId,
          endAnchorId,
        });
      }

      await anchorsTable.bulkPut(anchorsToInsert);
      await utterancesTable.bulkPut(utterancesToUpdate);
    });

    this.version(7).stores({
      corpus_lexicon_links: 'id, utteranceId, lexemeId, annotationId',
    }).upgrade(async (tx: Transaction) => {
      const linksTable = tx.table('corpus_lexicon_links');
      const allLinks = (await linksTable.toArray()) as Array<{ id: string; utteranceId: string; lexemeId: string; annotationId: string; wordIndex?: number }>;
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

    // v10: Rename utterance_translations → utterance_texts + strip deprecated transcription cache
    this.version(10).stores({
      utterance_translations: null,
      utterance_texts: 'id, utteranceId, translationLayerId, [utteranceId+translationLayerId], updatedAt',
    }).upgrade(async (tx: Transaction) => {
      // 1. Copy all rows from old table to new table
      const oldTable = tx.table('utterance_translations');
      const newTable = tx.table('utterance_texts');
      const allRows = await oldTable.toArray();
      if (allRows.length > 0) {
        await newTable.bulkPut(allRows);
      }

      // 2. Migrate utterance.transcription.default → utterance_texts if not yet present
      const utterancesTable = tx.table('utterances');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();

      for (const utt of allUtterances) {
        const defaultText = utt.transcription?.['default'];
        if (!defaultText) continue;

        // Check if there's already an utterance_text for the default transcription layer
        const existing = await newTable.where('[utteranceId+translationLayerId]').equals([utt.id, 'default']).first();
        if (!existing) {
          const now = new Date().toISOString();
          await newTable.put({
            id: `ut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            utteranceId: utt.id,
            translationLayerId: 'default',
            modality: 'text',
            text: defaultText,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // 3. Strip transcription field from utterances
      const cleaned = allUtterances.map(({ transcription, ...rest }) => rest);
      if (cleaned.length > 0) {
        await utterancesTable.bulkPut(cleaned);
      }
    });

    // v11: Add textId to translation_layers (scope layers per text)
    this.version(11).stores({
      translation_layers: 'id, textId, key, languageId, updatedAt, layerType',
    }).upgrade(async (tx: Transaction) => {
      const layersTable = tx.table('translation_layers');
      const allLayers = (await layersTable.toArray()) as LayerDocType[];
      if (allLayers.length === 0) return;

      // Find textId from utterances or texts
      const utterancesTable = tx.table('utterances');
      const firstUtt = await utterancesTable.toCollection().first();
      let textId = firstUtt?.textId;

      if (!textId) {
        const textsTable = tx.table('texts');
        const firstText = await textsTable.toCollection().first();
        textId = firstText?.id;
      }

      if (!textId) return; // No text in DB — layers will need manual fix

      const updated = allLayers.map((layer) => ({ ...layer, textId }));
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
    // Adds optional fields to utterances (no index change except speakerId):
    //   - speakerId: FK reference to speakers table (replaces freetext `speaker`)
    //   - annotationStatus: coverage depth enum
    //   - words: UtteranceWord[] with optional Morpheme[] nested structure
    this.version(13).stores({
      utterances: 'id, textId, startTime, updatedAt, speakerId',
    });
    // No upgrade hook needed — new fields are optional and default to undefined.
    // Existing utterances remain valid; speakerId index is populated on next save.

    // v14: Schema expansion — F1 schema补全 + 多假设标注 + F29 user_notes扩展
    // - OrthographyDocType: +scriptTag, +conversionRules (F30 预留)
    // - TierAnnotationDocType: +createdBy, +method (provenance), +hypotheses[] (多假设标注)
    // - NoteTargetType: +'word'|'morpheme'|'annotation'
    // - NoteCategory: +'linguistic'|'fieldwork'|'correction'
    // All new fields are optional — no index changes, no upgrade hook needed.
    this.version(14).stores({});

    // v15: Phase A/B foundation — provenance envelope + stable word/morpheme ids.
    this.version(15).stores({}).upgrade(async (tx: Transaction) => {
      const utterancesTable = tx.table('utterances');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();
      if (allUtterances.length === 0) return;

      let changed = false;
      let wordCounter = 0;
      let morphCounter = 0;
      const nowPart = Date.now();

      const updatedUtterances = allUtterances.map((utterance) => {
        if (!Array.isArray(utterance.words) || utterance.words.length === 0) return utterance;

        let utteranceChanged = false;
        const nextWords = utterance.words.map((word) => {
          const nextWordId = typeof word.id === 'string' && word.id.length > 0
            ? word.id
            : `tok_${nowPart}_${++wordCounter}`;
          if (nextWordId !== word.id) utteranceChanged = true;

          const nextMorphemes = Array.isArray(word.morphemes)
            ? word.morphemes.map((morpheme) => {
              const nextMorphId = typeof morpheme.id === 'string' && morpheme.id.length > 0
                ? morpheme.id
                : `morph_${nowPart}_${++morphCounter}`;
              if (nextMorphId !== morpheme.id) utteranceChanged = true;
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

        if (!utteranceChanged) return utterance;
        changed = true;
        return {
          ...utterance,
          words: nextWords,
        };
      });

      if (changed) {
        await utterancesTable.bulkPut(updatedUtterances);
      }
    });

    // v16: canonical token/morpheme entities for stable word-level operations.
    this.version(16).stores({
      utterance_tokens: 'id, textId, utteranceId, [utteranceId+tokenIndex], lexemeId',
      utterance_morphemes: 'id, textId, utteranceId, tokenId, [tokenId+morphemeIndex], lexemeId',
    }).upgrade(async (tx: Transaction) => {
      const utterancesTable = tx.table('utterances');
      const tokensTable = tx.table('utterance_tokens');
      const morphemesTable = tx.table('utterance_morphemes');
      const allUtterances: UtteranceDocType[] = await utterancesTable.toArray();
      if (allUtterances.length === 0) return;

      const nextTokens: unknown[] = [];
      const nextMorphemes: unknown[] = [];
      let tokenCounter = 0;
      let morphemeCounter = 0;
      const nowSeed = Date.now();

      for (const utterance of allUtterances) {
        if (!Array.isArray(utterance.words) || utterance.words.length === 0) continue;
        const createdAt = utterance.createdAt;
        const updatedAt = utterance.updatedAt;

        for (let wi = 0; wi < utterance.words.length; wi++) {
          const word = utterance.words[wi]!;
          const tokenId = `tokv16_${nowSeed}_${++tokenCounter}`;

          nextTokens.push({
            id: tokenId,
            textId: utterance.textId,
            utteranceId: utterance.id,
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
              textId: utterance.textId,
              utteranceId: utterance.id,
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
        await tokensTable.bulkPut(nextTokens as unknown as UtteranceTokenDocType[]);
      }
      if (nextMorphemes.length > 0) {
        await morphemesTable.bulkPut(nextMorphemes as unknown as UtteranceMorphemeDocType[]);
      }
    });

    // v17: CAM-v2 naming + token-level links + ai/embedding foundational tables.
    this.version(17).stores({
      utterance_tokens: 'id, textId, utteranceId, [utteranceId+tokenIndex], lexemeId',
      utterance_morphemes: 'id, textId, utteranceId, tokenId, [tokenId+morphemeIndex], lexemeId',
      utterance_texts: 'id, utteranceId, tierId, [utteranceId+tierId], updatedAt',
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
      segment_links: 'id, textId, sourceSegmentId, targetSegmentId, [sourceSegmentId+targetSegmentId], linkType, utteranceId',
    }).upgrade(async (tx: Transaction) => {
      const utterancesTable = tx.table('utterances');
      const utteranceTextsTable = tx.table('utterance_texts');
      const tierDefinitionsTable = tx.table('tier_definitions');
      const layerSegmentsTable = tx.table('layer_segments');
      const layerSegmentContentsTable = tx.table('layer_segment_contents');
      const segmentLinksTable = tx.table('segment_links');

      const utterances: UtteranceDocType[] = await utterancesTable.toArray();
      if (utterances.length === 0) return;

      const utteranceTexts: UtteranceTextDocType[] = await utteranceTextsTable.toArray();
      const tiers: TierDefinitionDocType[] = await tierDefinitionsTable.toArray();

      const rows = buildSegmentationV2BackfillRows({
        utterances,
        utteranceTexts,
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
      segment_links: 'id, textId, sourceSegmentId, targetSegmentId, sourceLayerId, targetLayerId, [sourceSegmentId+targetSegmentId], linkType, utteranceId',
    });

    // v24: rename utterance_texts.tierId → layerId, layer_links.tierId → layerId
    // 统一字段命名为 layerId，消除历史 tier/layer 混用 | Unify field naming to layerId, eliminating legacy tier/layer ambiguity
    this.version(24).stores({
      utterance_texts: 'id, utteranceId, layerId, [utteranceId+layerId], updatedAt',
      layer_links: 'id, transcriptionLayerKey, layerId',
    }).upgrade(async (tx: Transaction) => {
      const utteranceTextsTable = tx.table('utterance_texts');
      await utteranceTextsTable.toCollection().modify((row: Record<string, unknown>) => {
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

    // v25: 为 layer_segments 添加 utteranceId 索引，消除 removeUtteranceCascade 全表扫描
    // Add utteranceId index to layer_segments, eliminating full table scan in removeUtteranceCascade
    this.version(25).stores({
      layer_segments: 'id, textId, mediaId, layerId, utteranceId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId]',
    }).upgrade(async (tx: Transaction) => {
      const layerSegmentsTable = tx.table('layer_segments');

      const prefixes = ['segv2_', 'segv22_'];
      await layerSegmentsTable.toCollection().modify((row: Record<string, unknown>) => {
        if (row.utteranceId) return; // 已有则跳过 | Skip if already present
        const segmentId = row.id as string;
        const layerId = row.layerId as string;
        for (const prefix of prefixes) {
          const expected = `${prefix}${layerId}_`;
          if (segmentId.startsWith(expected)) {
            const value = segmentId.slice(expected.length).trim();
            if (value.length > 0) {
              row.utteranceId = value;
              return;
            }
          }
        }
      });
    });

    // v26: track_entities — per-media track display state persisted to DB.
    // Migration: read from LocalStorage (v1 PoC), write to DB, then clear LocalStorage.
    this.version(26).stores({
      track_entities: 'id, textId, mediaId, [textId+mediaId]',
    }).upgrade(async (tx: Transaction) => {
      const trackEntitiesTable = tx.table('track_entities');

      // Read v1 LocalStorage data
      const STORAGE_KEY = 'jieyu:track-entity-state:v1';
      let localData: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) localData = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // ignore parse errors
      }

      if (Object.keys(localData).length === 0) return;

      const now = new Date().toISOString();
      const toInsert: TrackEntityDocType[] = [];

      for (const [mediaId, value] of Object.entries(localData)) {
        if (!value || typeof value !== 'object') continue;
        const row = value as Record<string, unknown>;

        // textId is unknown at this level — use '__unknown__' as placeholder;
        // consumers that have a textId scope will filter accordingly.
        const textId = '__unknown__';
        const laneLockMap: Record<string, number> = {};
        if (row.laneLockMap && typeof row.laneLockMap === 'object') {
          for (const [k, v] of Object.entries(row.laneLockMap as Record<string, unknown>)) {
            if (Number.isInteger(v) && (v as number) >= 0) {
              laneLockMap[k] = v as number;
            }
          }
        }

        const mode = (row.mode === 'multi-auto' || row.mode === 'multi-locked' || row.mode === 'multi-speaker-fixed')
          ? (row.mode as 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed')
          : 'single';

        toInsert.push({
          id: `track_${mediaId}`,
          textId,
          mediaId,
          mode,
          laneLockMap,
          updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : now,
        });
      }

      if (toInsert.length > 0) {
        await trackEntitiesTable.bulkPut(toInsert);
      }

      // Keep LocalStorage as fallback safety net; cleanup can be done by explicit maintenance task later.
      // 保留 LocalStorage 作为兜底，避免迁移提交窗口崩溃导致“本地已删、DB未完成”丢失。
    });

    // v27: Plan B foundation — unified per-layer timeline units.
    // 统一时间单元基座：先回填默认转写层与独立段层，后续逐步替换业务读写。
    this.version(27).stores({
      layer_utterances: 'id, textId, mediaId, layerId, sourceKind, sourceId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [textId+layerId], [layerId+sourceKind+sourceId]',
    }).upgrade(async (tx: Transaction) => {
      const utterancesTable = tx.table('utterances');
      const tiersTable = tx.table('tier_definitions');
      const layerSegmentsTable = tx.table('layer_segments');
      const layerUtterancesTable = tx.table('layer_utterances');

      const [utterances, tiers, segments] = await Promise.all([
        utterancesTable.toArray() as Promise<UtteranceDocType[]>,
        tiersTable.toArray() as Promise<TierDefinitionDocType[]>,
        layerSegmentsTable.toArray() as Promise<LayerSegmentDocType[]>,
      ]);

      if (utterances.length === 0 && segments.length === 0) return;

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

      type LayerUtteranceMigrationRow = {
        id: string;
        textId: string;
        mediaId: string;
        layerId: string;
        sourceKind: 'utterance' | 'segment';
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

      const rowsById = new Map<string, LayerUtteranceMigrationRow>();
      for (const utt of utterances) {
        const defaultTrc = defaultTrcByText.get(utt.textId);
        if (!defaultTrc || !utt.mediaId) continue;
        const id = `lu_${defaultTrc.id}_utt_${utt.id}`;
        rowsById.set(id, {
          id,
          textId: utt.textId,
          mediaId: utt.mediaId,
          layerId: defaultTrc.id,
          sourceKind: 'utterance',
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
        const id = `lu_${seg.layerId}_seg_${seg.id}`;
        rowsById.set(id, {
          id,
          textId: seg.textId,
          mediaId: seg.mediaId,
          layerId: seg.layerId,
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
        await layerUtterancesTable.bulkPut(rows);
      }
    });

    // v28: Backfill utterance_texts → layer_segment_contents（Phase 0 去双写安全网）
    // 确保每一条 utterance_texts 行都有对应 V2 条目；v22 迁移的条目用 segv22_ 前缀，
    // 后续 BridgeService 写入的用 segv2_ 前缀，此处按 content ID 幂等补全。
    // Ensure every utterance_texts row has a corresponding V2 entry. Idempotent by content ID.
    this.version(28).stores({}).upgrade(async (tx: Transaction) => {
      const utteranceTextsTable = tx.table('utterance_texts');
      const utterancesTable     = tx.table('utterances');
      const layerSegmentsTable  = tx.table('layer_segments');
      const layerSegmentContentsTable = tx.table('layer_segment_contents');

      const [allTexts, allUtterances, existingContents, existingSegmentIds] = await Promise.all([
        utteranceTextsTable.toArray() as Promise<UtteranceTextDocType[]>,
        utterancesTable.toArray()     as Promise<UtteranceDocType[]>,
        layerSegmentContentsTable.toArray() as Promise<LayerSegmentContentDocType[]>,
        (layerSegmentsTable.toCollection().primaryKeys()) as Promise<string[]>,
      ]);

      if (allTexts.length === 0) return;

      const utteranceById = new Map(allUtterances.map((u: UtteranceDocType) => [u.id, u]));
      const existingContentById = new Map(existingContents.map((c: LayerSegmentContentDocType) => [c.id, c]));
      const existingSegmentIdSet = new Set(existingSegmentIds);
      const now = new Date().toISOString();

      const BATCH_SIZE = 200;
      const segmentBatch: LayerSegmentDocType[] = [];
      const contentBatch: LayerSegmentContentDocType[] = [];

      for (const text of allTexts) {
        const utt = utteranceById.get(text.utteranceId);
        if (!utt) continue; // 孤立 text，跳过 | orphan text, skip
        const existingContent = existingContentById.get(text.id);

        // 修复分支：若 content 存在但 segment 丢失，重建 canonical segment 并回指 | Repair branch: rebuild canonical segment when content exists but segment is missing
        const plan = buildV28BackfillPlanForText({
          text,
          utterance: utt,
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

    // v29: V2 single-source-of-truth cutoff — drop legacy utterance_texts table.
    this.version(29).stores({
      utterance_texts: null,
    });

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

    // v32: remove abandoned layer_utterances table.
    // 删除未落地消费者的 layer_utterances 死表，避免继续悬空存在。
    this.version(32).stores({
      layer_utterances: null,
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

    // v36: 恢复 utterances 的 mediaId 单字段索引（v13 重声明时意外丢失）
    // Restore standalone mediaId index on utterances (accidentally dropped by v13 redeclaration)
    this.version(36).stores({
      utterances: 'id, textId, mediaId, [textId+mediaId], [mediaId+startTime], [textId+startTime], startTime, updatedAt, speakerId',
    });

    // v37: M18 — utterances → layer_units; token/morpheme utteranceId → unitId; drop utterances store.
    this.version(37).stores({
      utterances: null,
      utterance_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
      utterance_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
    }).upgrade(async (tx: Transaction) => {
      await upgradeM18LinguisticUtteranceCutover(tx);
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
    globalWithDb.__jieyuDexie__ = new JieyuDexie(JIEYU_DB_NAME);
  }
  return globalWithDb.__jieyuDexie__;
}



export type JieyuDatabase = {
  name: string;
  dexie: JieyuDexie;
  collections: JieyuCollections;
  close: () => Promise<void>;
};

async function _createDb(): Promise<JieyuDatabase> {
  const dexie = getOrCreateDexie();
  await dexie.open();

  const collections: JieyuCollections = {
    texts: new DexieCollectionAdapter(dexie.texts, validateTextDoc),
    media_items: new DexieCollectionAdapter(dexie.media_items, validateMediaItemDoc),
    utterance_tokens: new DexieCollectionAdapter(dexie.utterance_tokens, validateUtteranceTokenDoc),
    utterance_morphemes: new DexieCollectionAdapter(dexie.utterance_morphemes, validateUtteranceMorphemeDoc),
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

export const db = getOrCreateDexie();
