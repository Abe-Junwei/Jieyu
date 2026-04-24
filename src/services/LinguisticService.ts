import Dexie from 'dexie';
import {
  exportDatabaseAsJson,
  getDb,
  importDatabaseFromJson,
  runDexieIndexedQueryOrElse,
  type ImportConflictStrategy,
  type ImportResult,
  type LayerDocType,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type LexemeDocType,
  type MediaItemDocType,
  type OrthographyBridgeDocType,
  type OrthographyDocType,
  type SpeakerDocType,
  type TextDocType,
  type TokenLexemeLinkDocType,
  type TokenLexemeLinkTargetType,
  type UnitMorphemeDocType,
  type UnitTokenDocType,
} from '../db';
import { syncLayerToTier } from './TierBridgeService';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { newId } from '../../src/utils/transcriptionFormatters';
import { normalizeUnitDocForStorage } from '../../src/utils/camDataUtils';
import { enforceTimeSubdivisionParentBounds, listUnitTextsFromSegmentation, listUnitTextsByUnit, syncUnitTextToSegmentationV2 } from './LayerSegmentationTextService';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';
import type { SpeakerReferenceStatsBundle } from '../hooks/speakerManagement/types';
import { hasEmbeddedDefaultTextChanged, invalidateUnitEmbeddings, isDefaultTranscriptionLayerForUnitText } from '../ai/embeddings/EmbeddingInvalidationService';
import { bulkUpsertUnitLayerUnits, getUnitDocProjectionById, listUnitDocsFromCanonicalLayerUnits, upsertUnitLayerUnit } from './LayerSegmentGraphService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import {
  deleteAudioPreserveTimeline,
  deleteProjectCascade,
  removeUnitCascade,
  removeUnitsBatchCascade,
} from './LinguisticService.cleanup';
import {
  isAuxiliaryRecordingMediaRow,
  isMediaItemPlaceholderRow,
  MEDIA_TIMELINE_KIND_ACOUSTIC,
  MEDIA_TIMELINE_KIND_PLACEHOLDER,
  withResolvedMediaItemTimelineKind,
} from '../utils/mediaItemTimelineKind';
import { remapLayerUnitsAndAnchorsForFirstAcousticImport } from '../utils/remapLayerUnitsForFirstAcousticImport';
import { type ImportQualityReport } from './LinguisticService.constraints';
import type { ApplyOrthographyBridgeInput, CloneOrthographyToLanguageInput, CreateOrthographyInput, CreateOrthographyBridgeInput, GetActiveOrthographyBridgeInput, ListOrthographyRecordsSelector, ListOrthographyBridgesSelector, PreviewOrthographyBridgeInput, UpdateOrthographyInput, UpdateOrthographyBridgeInput } from './LinguisticService.orthography';
import type { LanguageCatalogEntry, UpsertLanguageCatalogEntryInput } from './LinguisticService.languageCatalog';
import { lookupIso639_3Seed } from './languageCatalogSeedLookup';
import { SegmentMetaService } from './SegmentMetaService';
import {
  invertTextTimeMapping as invertTextTimeMappingImpl,
  mergeTextTimeMappingHistory,
  normalizeTextTimeMapping,
  previewTextTimeMapping as previewTextTimeMappingImpl,
} from './LinguisticService.timeMapping';
import type {
  PreviewTextTimeMappingInput,
  PreviewTextTimeMappingResult,
  TextTimeMapping,
  UpdateTextTimeMappingInput,
} from './LinguisticService.timeMapping';
export type { Iso639_3Seed } from './languageCatalogSeedLookup';

export {
  type ConstraintSeverity,
  type ConstraintViolation,
  type ImportQualityReport,
  type TierSaveResult,
  validateTierConstraints,
} from './LinguisticService.constraints';

export type {
  MultiLangString,
  OrthographyDocType,
  OrthographyBridgeDocType,
  LanguageCatalogVisibility,
} from '../db';
export type {
  LanguageCatalogEntry,
  LanguageCatalogDisplayNameEntry,
  UpsertLanguageCatalogEntryInput,
} from './LinguisticService.languageCatalog';
export type {
  PreviewTextTimeMappingInput,
  PreviewTextTimeMappingResult,
  TextTimeMapping,
  UpdateTextTimeMappingInput,
} from './LinguisticService.timeMapping';

import { resolveLanguageQuery as resolveLanguageQueryImpl, searchLanguageCatalog } from '../utils/langMapping';
import { previewOrthographyBridge as previewOrthographyBridgeText } from '../utils/orthographyBridges';
export type {
  LanguageCatalogMatch,
  LanguageCatalogMatchSource,
  LanguageSearchLocale,
} from '../utils/langMapping';

function loadTierService() {
  return import('./LinguisticService.tiers');
}

function loadOrthographyService() {
  return import('./LinguisticService.orthography');
}

function loadLanguageCatalogService() {
  return import('./LinguisticService.languageCatalog');
}

let deferredLanguageCatalogRefreshScheduled = false;

/** 词典 → 转写深链：由 `token_lexeme_links` 解析出的可跳转时间轴单元 | Lexicon → transcription deep-link row */
export interface LexemeTranscriptionJumpTarget {
  textId: string;
  unitId: string;
  layerId: string;
  mediaId?: string;
  unitKind: 'unit' | 'segment';
  surfaceHint?: string;
  linkUpdatedAt: string;
}

export class LinguisticService {
  static async generateImportQualityReport(textId?: string): Promise<ImportQualityReport> {
    const db = await getDb();

    const [unitsAll, unitTextsAll, layersAll, tokensAll, morphemesAll, userNotesAll, anchorsAll] = await Promise.all([
      listUnitDocsFromCanonicalLayerUnits(db),
      listUnitTextsFromSegmentation(db),
      db.collections.layers.find().exec().then((docs) => docs.map((doc) => doc.toJSON())),
      db.dexie.unit_tokens.toArray(),
      db.dexie.unit_morphemes.toArray(),
      db.dexie.user_notes.toArray(),
      db.dexie.anchors.toArray(),
    ]);

    const inScopeUnits = textId
      ? unitsAll.filter((u) => u.textId === textId)
      : unitsAll;
    const inScopeUnitIds = new Set(inScopeUnits.map((u) => u.id));

    const inScopeUnitTexts = unitTextsAll.filter((row) => Boolean(row.unitId && inScopeUnitIds.has(row.unitId)));
    const inScopeTokens = tokensAll.filter((row) => inScopeUnitIds.has(row.unitId));
    const inScopeMorphemes = morphemesAll.filter((row) => inScopeUnitIds.has(row.unitId));

    const inScopeTokenIds = new Set(inScopeTokens.map((t) => t.id));
    const inScopeMorphemeIds = new Set(inScopeMorphemes.map((m) => m.id));
    const inScopeTranslationIds = new Set(inScopeUnitTexts.map((t) => t.id));

    const inScopeNotes = userNotesAll.filter((note) => {
      if (!textId) return true;
      if (note.targetType === 'unit') return inScopeUnitIds.has(note.targetId);
      if (note.targetType === 'translation') return inScopeTranslationIds.has(note.targetId);
      if (note.targetType === 'token') {
        return inScopeTokenIds.has(note.targetId)
          || (typeof note.parentTargetId === 'string' && inScopeUnitIds.has(note.parentTargetId));
      }
      if (note.targetType === 'morpheme') {
        return inScopeMorphemeIds.has(note.targetId)
          || (typeof note.parentTargetId === 'string' && inScopeTokenIds.has(note.parentTargetId));
      }
      return false;
    });

    const layerTypeById = new Map(layersAll.map((layer) => [layer.id, layer.layerType] as const));

    const transcribedUttIds = new Set<string>();
    const translatedUttIds = new Set<string>();
    const glossedUttIds = new Set<string>();
    const verifiedUttIds = new Set<string>();

    for (const utt of inScopeUnits) {
      const legacyTr = utt.transcription?.default;
      if (typeof legacyTr === 'string' && legacyTr.trim().length > 0) {
        transcribedUttIds.add(utt.id);
      }
      if (utt.annotationStatus === 'verified') {
        verifiedUttIds.add(utt.id);
      }
    }

    for (const row of inScopeUnitTexts) {
      const unitId = row.unitId?.trim();
      const layerId = row.layerId?.trim();
      const text = row.text?.trim() ?? '';
      if (!unitId || !layerId || !text) continue;
      const layerType = layerTypeById.get(layerId);
      if (layerType === 'transcription') transcribedUttIds.add(unitId);
      if (layerType === 'translation') translatedUttIds.add(unitId);
    }

    for (const token of inScopeTokens) {
      if (token.gloss && Object.keys(token.gloss).length > 0) {
        glossedUttIds.add(token.unitId);
        continue;
      }
      if (token.pos && token.pos.trim().length > 0) {
        glossedUttIds.add(token.unitId);
      }
    }
    for (const morph of inScopeMorphemes) {
      if (morph.gloss && Object.keys(morph.gloss).length > 0) {
        glossedUttIds.add(morph.unitId);
        continue;
      }
      if (morph.pos && morph.pos.trim().length > 0) {
        glossedUttIds.add(morph.unitId);
      }
    }

    const unitById = new Set(inScopeUnits.map((u) => u.id));
    const tokenById = new Set(inScopeTokens.map((u) => u.id));
    const morphemeById = new Set(inScopeMorphemes.map((u) => u.id));
    const translationById = new Set(inScopeUnitTexts.map((u) => u.id));

    let orphanNotes = 0;
    for (const note of inScopeNotes) {
      if (note.targetType === 'unit' && !unitById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'token' && !tokenById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'morpheme' && !morphemeById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'translation' && !translationById.has(note.targetId)) orphanNotes++;
    }

    const referencedAnchors = new Set<string>();
    for (const utt of inScopeUnits) {
      if (utt.startAnchorId) referencedAnchors.add(utt.startAnchorId);
      if (utt.endAnchorId) referencedAnchors.add(utt.endAnchorId);
    }
    let orphanAnchors = 0;
    for (const anchor of anchorsAll) {
      if (!referencedAnchors.has(anchor.id)) orphanAnchors++;
    }

    const totalUnits = inScopeUnits.length;
    const ratio = (part: number): number => (totalUnits === 0 ? 0 : part / totalUnits);

    const transcriptionLayers = layersAll.filter((l) => l.layerType === 'transcription');
    const translationLayers = layersAll.filter((l) => l.layerType === 'translation');
    const inScopeTextIds = new Set(inScopeUnits.map((u) => u.textId));

    return {
      generatedAt: new Date().toISOString(),
      scope: textId ? { textId } : {},
      totals: {
        units: totalUnits,
        unitTexts: inScopeUnitTexts.length,
        transcriptionLayers: transcriptionLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
        translationLayers: translationLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
        canonicalTokens: inScopeTokens.length,
        canonicalMorphemes: inScopeMorphemes.length,
        userNotes: inScopeNotes.length,
      },
      coverage: {
        transcribedUnits: transcribedUttIds.size,
        translatedUnits: translatedUttIds.size,
        glossedUnits: glossedUttIds.size,
        verifiedUnits: verifiedUttIds.size,
        transcribedRate: ratio(transcribedUttIds.size),
        translatedRate: ratio(translatedUttIds.size),
        glossedRate: ratio(glossedUttIds.size),
        verifiedRate: ratio(verifiedUttIds.size),
      },
      integrity: {
        orphanNotes,
        orphanAnchors,
      },
    };
  }

  static async getAllUnits(): Promise<LayerUnitDocType[]> {
    const db = await getDb();
    return listUnitDocsFromCanonicalLayerUnits(db);
  }

  static async getUnitAtTime(time: number): Promise<LayerUnitDocType | undefined> {
    const db = await getDb();
    const docs = await listUnitDocsFromCanonicalLayerUnits(db);
    return docs.find((u) => u.startTime <= time && u.endTime >= time);
  }

  static async getSpeakers(): Promise<SpeakerDocType[]> {
    const db = await getDb();
    const docs = await db.collections.speakers.find().exec();
    return docs
      .map((doc) => doc.toJSON())
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'zh-Hans-CN');
        if (byName !== 0) return byName;
        return a.id.localeCompare(b.id, 'en');
      });
  }

  static async getSpeakerReferenceStats(options?: { mediaId?: string | null }): Promise<SpeakerReferenceStatsBundle> {
    const db = await getDb();
    const [unitRowsRaw, allSegments] = await Promise.all([
      listUnitDocsFromCanonicalLayerUnits(db),
      LayerSegmentQueryService.listAllSegments(),
    ]);

    const mediaKey = typeof options?.mediaId === 'string' ? options.mediaId.trim() : '';
    const unitRows = mediaKey.length > 0
      ? unitRowsRaw.filter((row) => (row.mediaId ?? '').trim() === mediaKey)
      : unitRowsRaw;
    const segments = mediaKey.length > 0
      ? allSegments.filter((row) => (row.mediaId?.trim() ?? '') === mediaKey)
      : allSegments;

    const stats = new Map<string, { transcriptionUnitCount: number; segmentCount: number; totalCount: number }>();
    const unassigned = { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 };

    const ensure = (speakerId: string) => {
      const normalizedId = speakerId.trim();
      if (!normalizedId) return null;
      const existing = stats.get(normalizedId);
      if (existing) return existing;
      const next = { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 };
      stats.set(normalizedId, next);
      return next;
    };

    for (const doc of unitRows) {
      const speakerId = doc.speakerId?.trim();
      if (!speakerId) {
        unassigned.transcriptionUnitCount += 1;
        unassigned.totalCount += 1;
        continue;
      }
      const target = ensure(speakerId);
      if (!target) continue;
      target.transcriptionUnitCount += 1;
      target.totalCount += 1;
    }

    for (const segment of segments) {
      const speakerId = segment.speakerId?.trim();
      if (!speakerId) {
        unassigned.segmentCount += 1;
        unassigned.totalCount += 1;
        continue;
      }
      const target = ensure(speakerId);
      if (!target) continue;
      target.segmentCount += 1;
      target.totalCount += 1;
    }

    return { perSpeaker: Object.fromEntries(stats.entries()), unassigned };
  }

  static async createSpeaker(input: {
    name: string;
    pseudonym?: string;
    role?: SpeakerDocType['role'];
  }): Promise<SpeakerDocType> {
    const db = await getDb();
    const name = input.name.trim();
    if (!name) throw new Error('\u8bf4\u8bdd\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a');

    const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
    const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
    const duplicate = existingSpeakers.find((speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName);
    if (duplicate) throw new Error(`\u8bf4\u8bdd\u4eba\u5df2\u5b58\u5728: ${duplicate.name}`);

    const now = new Date().toISOString();
    const speaker: SpeakerDocType = {
      id: newId('speaker'),
      name,
      ...(input.pseudonym?.trim() ? { pseudonym: input.pseudonym.trim() } : {}),
      ...(input.role ? { role: input.role } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.collections.speakers.insert(speaker);
    return speaker;
  }

  static async renameSpeaker(speakerId: string, nextName: string): Promise<SpeakerDocType> {
    const db = await getDb();
    const id = speakerId.trim();
    const name = nextName.trim();
    if (!id) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');
    if (!name) throw new Error('\u8bf4\u8bdd\u4eba\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a');

    const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
    if (!speakerDoc) throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${id}`);

    const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
    const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
    const duplicate = existingSpeakers.find((speaker) => (
      speaker.id !== id && speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName
    ));
    if (duplicate) throw new Error(`\u8bf4\u8bdd\u4eba\u5df2\u5b58\u5728: ${duplicate.name}`);

    const current = speakerDoc.toJSON();
    const now = new Date().toISOString();
    const updated: SpeakerDocType = {
      ...current,
      name,
      updatedAt: now,
    };
    await db.collections.speakers.insert(updated);

    return updated;
  }

  static async mergeSpeakers(sourceSpeakerId: string, targetSpeakerId: string): Promise<number> {
    const db = await getDb();
    const sourceId = sourceSpeakerId.trim();
    const targetId = targetSpeakerId.trim();
    if (!sourceId || !targetId) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');
    if (sourceId === targetId) return 0;

    const [sourceDoc, targetDoc] = await Promise.all([
      db.collections.speakers.findOne({ selector: { id: sourceId } }).exec(),
      db.collections.speakers.findOne({ selector: { id: targetId } }).exec(),
    ]);

    if (!sourceDoc) throw new Error(`\u6765\u6e90\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${sourceId}`);
    if (!targetDoc) throw new Error(`\u76ee\u6807\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${targetId}`);

    const target = targetDoc.toJSON();
    const now = new Date().toISOString();
    const unitRows = (await listUnitDocsFromCanonicalLayerUnits(db))
      .filter((row) => row.speakerId?.trim() === sourceId);
    const segments = (await LayerSegmentQueryService.listAllSegments())
      .filter((segment) => segment.speakerId?.trim() === sourceId);

    if (unitRows.length > 0) {
      const normalized = unitRows.map((row) => normalizeUnitDocForStorage({
        ...row,
        speakerId: target.id,
        speaker: target.name,
        updatedAt: now,
      }));
      await bulkUpsertUnitLayerUnits(db, normalized);
    }

    if (segments.length > 0) {
      const normalizedSegments = segments.map((segment) => ({
        ...segment,
        speakerId: target.id,
        updatedAt: now,
      }));
      await LayerUnitSegmentWriteService.upsertSegments(db, normalizedSegments);
    }

    await db.collections.speakers.remove(sourceId);
    return unitRows.length + segments.length;
  }

  static async deleteSpeaker(
    speakerId: string,
    options: {
      strategy?: 'clear' | 'merge' | 'reject';
      targetSpeakerId?: string;
    } = {},
  ): Promise<number> {
    const db = await getDb();
    const id = speakerId.trim();
    if (!id) throw new Error('\u8bf4\u8bdd\u4eba ID \u4e0d\u80fd\u4e3a\u7a7a');

    const strategy = options.strategy ?? 'reject';
    const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
    if (!speakerDoc) throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${id}`);

    const units = (await listUnitDocsFromCanonicalLayerUnits(db))
      .filter((row) => row.speakerId?.trim() === id);
    const segments = (await LayerSegmentQueryService.listAllSegments())
      .filter((segment) => segment.speakerId?.trim() === id);
    const affectedCount = units.length + segments.length;

    if (affectedCount > 0 && strategy === 'reject') {
      throw new Error(`\u8bf4\u8bdd\u4eba\u4ecd\u88ab ${affectedCount} \u6761\u53e5\u6bb5\u5f15\u7528`);
    }

    const now = new Date().toISOString();

    if (affectedCount > 0 && strategy === 'merge') {
      const targetId = options.targetSpeakerId?.trim();
      if (!targetId) throw new Error('\u5220\u9664\u8bf4\u8bdd\u4eba\u65f6\u672a\u6307\u5b9a\u8fc1\u79fb\u76ee\u6807');
      if (targetId === id) throw new Error('\u8fc1\u79fb\u76ee\u6807\u4e0d\u80fd\u662f\u5f53\u524d\u8bf4\u8bdd\u4eba');
      const targetDoc = await db.collections.speakers.findOne({ selector: { id: targetId } }).exec();
      if (!targetDoc) throw new Error(`\u76ee\u6807\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${targetId}`);
      const target = targetDoc.toJSON();

      const normalized = units.map((row) => normalizeUnitDocForStorage({
        ...row,
        speakerId: target.id,
        speaker: target.name,
        updatedAt: now,
      }));
      if (normalized.length > 0) {
        await bulkUpsertUnitLayerUnits(db, normalized);
      }

      if (segments.length > 0) {
        const normalizedSegments = segments.map((segment) => ({
          ...segment,
          speakerId: target.id,
          updatedAt: now,
        }));
        await LayerUnitSegmentWriteService.upsertSegments(db, normalizedSegments);
      }
    }

    if (affectedCount > 0 && strategy === 'clear') {
      const normalized = units.map((row) => {
        const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
        return normalizeUnitDocForStorage({
          ...rest,
          updatedAt: now,
        });
      });
      if (normalized.length > 0) {
        await bulkUpsertUnitLayerUnits(db, normalized);
      }

      if (segments.length > 0) {
        const normalizedSegments = segments.map((segment) => {
          const { speakerId: _oldSpeakerId, ...rest } = segment;
          return {
            ...rest,
            updatedAt: now,
          };
        });
        await LayerUnitSegmentWriteService.upsertSegments(db, normalizedSegments);
      }
    }

    void SegmentMetaService.syncForUnitIds([
      ...units.map((row) => row.id),
      ...segments.map((row) => row.id),
    ]).catch(() => {
      // SegmentMeta 为统一读模型，说话人同步失败不应阻塞删除流程 | SegmentMeta is a shared read model; speaker-sync failures must not block deletion.
    });
    await db.collections.speakers.remove(id);
    return affectedCount;
  }

  static async assignSpeakerToUnits(
    unitIds: Iterable<string>,
    speakerId?: string,
  ): Promise<number> {
    const db = await getDb();
    const ids = [...new Set(Array.from(unitIds).map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return 0;

    const selectedSpeakerId = speakerId?.trim();
    let speaker: SpeakerDocType | undefined;
    if (selectedSpeakerId) {
      const speakerDoc = await db.collections.speakers.findOne({ selector: { id: selectedSpeakerId } }).exec();
      if (!speakerDoc) {
        throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${selectedSpeakerId}`);
      }
      speaker = speakerDoc.toJSON();
    }

    const rows = (await Promise.all(ids.map((id) => getUnitDocProjectionById(db, id))))
      .filter((row): row is LayerUnitDocType => Boolean(row));
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    const updates = rows.map((row) => {
      const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
      return normalizeUnitDocForStorage({
        ...rest,
        ...(speaker ? { speaker: speaker.name, speakerId: speaker.id } : {}),
        updatedAt: now,
      });
    });

    await bulkUpsertUnitLayerUnits(db, updates);
    void SegmentMetaService.syncForUnitIds(updates.map((row) => row.id)).catch(() => {
      // SegmentMeta 为统一读模型，说话人同步失败不应阻塞主流程 | SegmentMeta is a shared read model; speaker-sync failures must not block the primary flow.
    });
    return updates.length;
  }

  static async assignSpeakerToSegments(
    segmentIds: Iterable<string>,
    speakerId?: string,
  ): Promise<number> {
    const db = await getDb();
    const ids = [...new Set(Array.from(segmentIds).map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return 0;

    const selectedSpeakerId = speakerId?.trim();
    let resolvedSpeakerId: string | undefined;
    if (selectedSpeakerId) {
      const speakerDoc = await db.collections.speakers.findOne({ selector: { id: selectedSpeakerId } }).exec();
      if (!speakerDoc) {
        throw new Error(`\u8bf4\u8bdd\u4eba\u4e0d\u5b58\u5728: ${selectedSpeakerId}`);
      }
      resolvedSpeakerId = speakerDoc.toJSON().id;
    }

    const rows = await LayerSegmentQueryService.listSegmentsByIds(ids);
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    const updates = rows.map((row) => {
      const { speakerId: _oldSpeakerId, ...rest } = row;
      return {
        ...rest,
        ...(resolvedSpeakerId ? { speakerId: resolvedSpeakerId } : {}),
        updatedAt: now,
      };
    });

    await LayerUnitSegmentWriteService.upsertSegments(db, updates);
    void SegmentMetaService.syncForUnitIds(updates.map((row) => row.id)).catch(() => {
      // SegmentMeta 为统一读模型，说话人同步失败不应阻塞主流程 | SegmentMeta is a shared read model; speaker-sync failures must not block the primary flow.
    });
    return updates.length;
  }

  static async saveUnit(data: LayerUnitDocType): Promise<string> {
    const db = await getDb();
    const normalized = normalizeUnitDocForStorage(data);
    const existing = await getUnitDocProjectionById(db, normalized.id);
    await enforceTimeSubdivisionParentBounds(
      db,
      normalized.id,
      normalized.startTime,
      normalized.endTime,
    );
    await upsertUnitLayerUnit(db, normalized);
    if (hasEmbeddedDefaultTextChanged(existing, normalized)) {
      await invalidateUnitEmbeddings(db, [normalized.id]);
    }
    void SegmentMetaService.syncForUnitIds([normalized.id]).catch(() => {
      // SegmentMeta 为统一读模型，刷新失败不应阻塞保存 | SegmentMeta is a shared read model; refresh failures must not block saves.
    });
    return normalized.id;
  }

  static async getUnitsByTextId(textId: string): Promise<LayerUnitDocType[]> {
    const db = await getDb();
    const all = await listUnitDocsFromCanonicalLayerUnits(db);
    return all.filter((u) => u.textId === textId);
  }

  static async saveUnitsBatch(items: LayerUnitDocType[]): Promise<void> {
    const db = await getDb();
    const normalized = items.map(normalizeUnitDocForStorage);
    const existingRows = await Promise.all(normalized.map((item) => getUnitDocProjectionById(db, item.id)));
    const changedUnitIds = normalized
      .filter((item, index) => hasEmbeddedDefaultTextChanged(existingRows[index], item))
      .map((item) => item.id);
    for (const row of normalized) {
      await enforceTimeSubdivisionParentBounds(
        db,
        row.id,
        row.startTime,
        row.endTime,
      );
    }
    await bulkUpsertUnitLayerUnits(db, normalized);
    if (changedUnitIds.length > 0) {
      await invalidateUnitEmbeddings(db, changedUnitIds);
    }
    void SegmentMetaService.syncForUnitIds(normalized.map((item) => item.id)).catch(() => {
      // SegmentMeta 为统一读模型，刷新失败不应阻塞批量保存 | SegmentMeta is a shared read model; refresh failures must not block batch saves.
    });
  }

  static async getTokensByUnitId(unitId: string): Promise<UnitTokenDocType[]> {
    const db = await getDb();
    const docs = await db.collections.unit_tokens.findByIndex('unitId', unitId);
    return docs.map((doc) => doc.toJSON()).sort((a, b) => a.tokenIndex - b.tokenIndex);
  }

  static async getMorphemesByTokenId(tokenId: string): Promise<UnitMorphemeDocType[]> {
    const db = await getDb();
    const docs = await db.collections.unit_morphemes.findByIndex('tokenId', tokenId);
    return docs.map((doc) => doc.toJSON()).sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  static async saveToken(data: UnitTokenDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.unit_tokens.insert(data);
    return doc.primary;
  }

  static async saveTokensBatch(items: UnitTokenDocType[]): Promise<void> {
    const db = await getDb();
    await db.collections.unit_tokens.bulkInsert(items);
  }

  static async updateTokenPos(tokenId: string, pos: string | null): Promise<void> {
    const db = await getDb();
    const existing = await db.collections.unit_tokens
      .findOne({ selector: { id: tokenId } }).exec();
    if (!existing) {
      throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
    }

    const row = existing.toJSON();
    const trimmed = (pos ?? '').trim();
    const nextPos = trimmed.length > 0 ? trimmed : undefined;
    const { pos: _oldPos, ...rest } = row;

    await db.collections.unit_tokens.insert({
      ...rest,
      ...(nextPos ? { pos: nextPos } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  static async updateTokenGloss(tokenId: string, gloss: string | null, lang = 'eng'): Promise<void> {
    const db = await getDb();
    const existing = await db.collections.unit_tokens
      .findOne({ selector: { id: tokenId } }).exec();
    if (!existing) {
      throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
    }

    const row = existing.toJSON();
    const trimmed = (gloss ?? '').trim();

    let nextGloss: Record<string, string> | undefined;
    if (trimmed.length > 0) {
      nextGloss = { ...(row.gloss ?? {}), [lang]: trimmed };
    } else if (row.gloss) {
      // \u6e05\u9664\u6307\u5b9a\u8bed\u8a00\u7684 gloss；\u82e5\u65e0\u5176\u4ed6\u8bed\u8a00\u5219\u6574\u4f53\u6e05\u9664
      // Remove gloss for this lang; clear entirely if no other langs remain
      const { [lang]: _removed, ...rest } = row.gloss;
      nextGloss = Object.keys(rest).length > 0 ? rest : undefined;
    }

    const { gloss: _oldGloss, ...rest } = row;
    await db.collections.unit_tokens.insert({
      ...rest,
      ...(nextGloss ? { gloss: nextGloss } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  static async batchUpdateTokenPosByForm(
    unitId: string,
    form: string,
    pos: string | null,
    orthographyKey = 'default',
  ): Promise<number> {
    const db = await getDb();
    const normalizedForm = form.trim();
    if (!normalizedForm) return 0;

    const tokens = await db.collections.unit_tokens.findByIndex('unitId', unitId);
    const rows = tokens.map((doc) => doc.toJSON());
    const normalizedPos = (pos ?? '').trim();
    const now = new Date().toISOString();

    const matches = rows.filter((row) => {
      const direct = row.form[orthographyKey];
      if (direct === normalizedForm) return true;
      return Object.values(row.form).some((v) => v === normalizedForm);
    });

    if (matches.length === 0) return 0;

    await db.collections.unit_tokens.bulkInsert(matches.map((row) => {
      const { pos: _oldPos, ...rest } = row;
      return {
        ...rest,
        ...(normalizedPos ? { pos: normalizedPos } : {}),
        updatedAt: now,
      };
    }));

    return matches.length;
  }

  static async saveMorpheme(data: UnitMorphemeDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.unit_morphemes.insert(data);
    return doc.primary;
  }

  static async saveMorphemesBatch(items: UnitMorphemeDocType[]): Promise<void> {
    const db = await getDb();
    await db.collections.unit_morphemes.bulkInsert(items);
  }

  static async removeToken(tokenId: string): Promise<void> {
    const db = await getDb();
    await db.collections.unit_morphemes.removeBySelector({ tokenId });
    await db.collections.unit_tokens.remove(tokenId);
    await db.collections.token_lexeme_links.removeBySelector({ targetType: 'token', targetId: tokenId });
  }

  static async saveTokenLexemeLink(data: TokenLexemeLinkDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.token_lexeme_links.insert(data);
    return doc.primary;
  }

  static async getTokenLexemeLinks(
    targetType: TokenLexemeLinkTargetType,
    targetId: string,
  ): Promise<TokenLexemeLinkDocType[]> {
    const db = await getDb();
    return db.dexie.token_lexeme_links.where('[targetType+targetId]').equals([targetType, targetId]).toArray();
  }

  static async removeTokenLexemeLinks(targetType: TokenLexemeLinkTargetType, targetId: string): Promise<void> {
    const db = await getDb();
    await db.collections.token_lexeme_links.removeBySelector({ targetType, targetId });
  }

  static async listLexemes(): Promise<LexemeDocType[]> {
    const db = await getDb();
    const docs = await db.collections.lexemes.find().exec();

    return docs
      .map((doc) => doc.toJSON())
      .sort((left, right) => {
        const usageDiff = (right.usageCount ?? 0) - (left.usageCount ?? 0);
        if (usageDiff !== 0) return usageDiff;

        const updatedDiff = right.updatedAt.localeCompare(left.updatedAt);
        if (updatedDiff !== 0) return updatedDiff;

        const leftLabel = Object.values(left.lemma)[0] ?? left.id;
        const rightLabel = Object.values(right.lemma)[0] ?? right.id;
        return leftLabel.localeCompare(rightLabel, 'zh-CN');
      });
  }

  static async searchLexemes(query: string): Promise<LexemeDocType[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const db = await getDb();
    const docs = await db.collections.lexemes.find().exec();
    return docs
      .map((doc) => doc.toJSON())
      .filter((item) =>
        Object.values(item.lemma).some((value) => value.toLowerCase().includes(normalized)),
      );
  }
  static async saveLexeme(data: LexemeDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.lexemes.insert(data);
    return doc.primary;
  }

  /**
   * 词条在转写库中的可跳转命中（经 token_lexeme_links → token/morpheme → layer_unit） |
   * Transcription jump targets for a lexeme via token/morpheme links into canonical layer units.
   */
  static async listLexemeTranscriptionJumpTargets(
    lexemeId: string,
    opts?: { limit?: number },
  ): Promise<LexemeTranscriptionJumpTarget[]> {
    const limit = Math.max(1, Math.min(opts?.limit ?? 40, 200));
    const id = lexemeId.trim();
    if (!id) return [];

    const db = await getDb();
    const links = await runDexieIndexedQueryOrElse(
      'LinguisticService.listLexemeTranscriptionJumpTargets:token_lexeme_links',
      () => db.dexie.token_lexeme_links.where('lexemeId').equals(id).toArray(),
      async () => {
        const all = await db.dexie.token_lexeme_links.toArray();
        return all.filter((row) => (row.lexemeId ?? '').trim() === id);
      },
    );
    links.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const seen = new Set<string>();
    const out: LexemeTranscriptionJumpTarget[] = [];

    for (const link of links) {
      if (out.length >= limit) break;

      let unitId = '';
      let textId = '';
      let surfaceHint: string | undefined;

      if (link.targetType === 'token') {
        const tok = await db.dexie.unit_tokens.get(link.targetId);
        if (!tok) continue;
        unitId = tok.unitId.trim();
        textId = tok.textId.trim();
        const rawForm = Object.values(tok.form ?? {}).find((v) => typeof v === 'string' && v.trim().length > 0);
        surfaceHint = typeof rawForm === 'string' ? rawForm.trim() : undefined;
      } else {
        const mor = await db.dexie.unit_morphemes.get(link.targetId);
        if (!mor) continue;
        unitId = mor.unitId.trim();
        textId = mor.textId.trim();
        const rawForm = Object.values(mor.form ?? {}).find((v) => typeof v === 'string' && v.trim().length > 0);
        surfaceHint = typeof rawForm === 'string' ? rawForm.trim() : undefined;
      }

      if (!unitId || !textId) continue;

      const layerUnit = await db.dexie.layer_units.get(unitId);
      if (!layerUnit) continue;

      const layerId = layerUnit.layerId?.trim() ?? '';
      if (!layerId) continue;

      const unitKind: 'unit' | 'segment' = layerUnit.unitType === 'segment' ? 'segment' : 'unit';
      const mediaId = layerUnit.mediaId?.trim() || undefined;
      const dedupeKey = `${textId}|${layerId}|${unitId}|${unitKind}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push({
        textId,
        unitId,
        layerId,
        ...(mediaId ? { mediaId } : {}),
        unitKind,
        ...(surfaceHint ? { surfaceHint } : {}),
        linkUpdatedAt: link.updatedAt,
      });
    }

    return out;
  }

  // 查询项目中使用的不重复语言 ID（从层定义表提取） | Query distinct language IDs used in the project (from layer definitions)
  static async listDistinctProjectLanguageIds(): Promise<string[]> {
    const db = await getDb();
    const docs = await db.collections.layers.find().exec();
    const seen = new Set<string>();
    docs.forEach((doc) => {
      const languageId = doc.toJSON().languageId?.trim().toLowerCase();
      if (languageId) {
        seen.add(languageId);
      }
    });
    return Array.from(seen).sort();
  }

  static async getTranslationLayers(
    layerType?: LayerDocType['layerType'],
    textId?: string,
  ): Promise<LayerDocType[]> {
    const db = await getDb();
    if (textId) {
      const docs = await db.collections.layers.findByIndex('textId', textId);
      const layers = docs.map((doc) => doc.toJSON());
      return layerType ? layers.filter((l) => l.layerType === layerType) : layers;
    }
    if (layerType) {
      const docs = await db.collections.layers.findByIndex('layerType', layerType);
      return docs.map((doc) => doc.toJSON());
    }
    const docs = await db.collections.layers.find().exec();
    return docs.map((doc) => doc.toJSON());
  }

  static async saveTranslationLayer(data: LayerDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.layers.insert(data);
    return doc.primary;
  }

  /** 协同远端 upsert：按 id 替换层并同步 tier 索引 | Replace layer by id for inbound collaboration */
  static async upsertLayer(data: LayerDocType): Promise<void> {
    const db = await getDb();
    if (data.id) {
      const existingDoc = await db.collections.layers.findOne({ selector: { id: data.id } }).exec();
      if (existingDoc) {
        await db.collections.layers.remove(data.id);
      }
    }
    await db.collections.layers.insert(data);
    await syncLayerToTier(data, data.textId);
  }

  static async getUnitTexts(unitId: string): Promise<LayerUnitContentDocType[]> {
    const db = await getDb();
    return listUnitTextsByUnit(db, unitId);
  }

  static async saveUnitText(data: LayerUnitContentDocType): Promise<string> {
    const db = await getDb();
    // \u5199\u5165 V2 segment \u8868 | Write to V2 segment tables
    const unitId = data.unitId?.trim();
    const layerId = data.layerId?.trim();
    if (unitId) {
      const unit = await getUnitDocProjectionById(db, unitId);
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, data);
      }
      if (layerId && await isDefaultTranscriptionLayerForUnitText(db, unitId, layerId)) {
        await invalidateUnitEmbeddings(db, [unitId]);
      }
    }
    return data.id;
  }

  static async getAllTexts(): Promise<TextDocType[]> {
    const db = await getDb();
    const docs = await db.collections.texts.find().exec();
    return docs.map((doc) => doc.toJSON());
  }

  /** 单条文本（略过 getAllTexts），供壳层在首屏尽快拿到 metadata.logicalDurationSec | Single text for faster first-paint */
  static async getTextById(textId: string): Promise<TextDocType | null> {
    const id = textId.trim();
    if (!id) return null;
    const db = await getDb();
    const existingDoc = await db.collections.texts.findOne({ selector: { id } }).exec();
    return existingDoc ? existingDoc.toJSON() : null;
  }

  static async saveText(data: TextDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.texts.insert(data);
    return doc.primary;
  }

  /**
   * 确保文本进入文献项目的逻辑时间模式 | Ensure the text is configured for document-mode logical time.
   */
  static async ensureDocumentTimeline(input: {
    textId: string;
    logicalDurationSec?: number;
  }): Promise<TextDocType> {
    const db = await getDb();
    const textId = input.textId.trim();
    if (!textId) throw new Error('textId 不能为空');

    const existingDoc = await db.collections.texts.findOne({ selector: { id: textId } }).exec();
    if (!existingDoc) throw new Error(`文本不存在: ${textId}`);

    const existing = existingDoc.toJSON();
    const metadata = (existing.metadata as Record<string, unknown> | undefined) ?? {};
    const logicalDurationSec = Number.isFinite(input.logicalDurationSec) && (input.logicalDurationSec ?? 0) > 0
      ? (input.logicalDurationSec as number)
      : (typeof metadata.logicalDurationSec === 'number' && Number.isFinite(metadata.logicalDurationSec)
        ? metadata.logicalDurationSec
        : 1800);
    const now = new Date().toISOString();

    const updated: TextDocType = {
      ...existing,
      metadata: {
        ...metadata,
        timelineMode: 'document',
        logicalDurationSec,
        timebaseLabel: 'logical-second',
      },
      updatedAt: now,
    };

    await db.collections.texts.remove(textId);
    await db.collections.texts.insert(updated);
    return updated;
  }

  static async updateTextTimeMapping(input: UpdateTextTimeMappingInput): Promise<TextDocType> {
    const db = await getDb();
    const textId = input.textId.trim();
    if (!textId) throw new Error('textId 不能为空');

    const existingDoc = await db.collections.texts.findOne({ selector: { id: textId } }).exec();
    if (!existingDoc) throw new Error(`文本不存在: ${textId}`);

    const existing = existingDoc.toJSON();
    const now = new Date().toISOString();
    const metadata = existing.metadata && typeof existing.metadata === 'object'
      ? existing.metadata as Record<string, unknown>
      : {};
    const currentMapping = normalizeTextTimeMapping(metadata.timeMapping);
    const mappingHistory = mergeTextTimeMappingHistory(currentMapping, metadata.timeMappingHistory);
    const nextOffsetSec = input.offsetSec ?? currentMapping?.offsetSec ?? 0;
    const nextScale = input.scale ?? currentMapping?.scale ?? 1;

    if (!Number.isFinite(nextOffsetSec)) {
      throw new Error('offsetSec 必须是有限数字');
    }
    if (nextOffsetSec < 0) {
      throw new Error('offsetSec 不能小于 0');
    }
    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      throw new Error('scale 必须是大于 0 的有限数字');
    }

    const nextMapping: TextTimeMapping = {
      offsetSec: nextOffsetSec,
      scale: nextScale,
      revision: (currentMapping?.revision ?? 0) + 1,
      updatedAt: now,
      ...(input.sourceMediaId?.trim()
        ? { sourceMediaId: input.sourceMediaId.trim() }
        : currentMapping?.sourceMediaId
          ? { sourceMediaId: currentMapping.sourceMediaId }
          : {}),
    };

    const updated: TextDocType = {
      ...existing,
      metadata: {
        ...metadata,
        timeMapping: nextMapping,
        ...(currentMapping ? { timeMappingRollback: currentMapping } : {}),
        ...(mappingHistory ? { timeMappingHistory: mappingHistory } : {}),
      },
      updatedAt: now,
    };

    await db.collections.texts.remove(textId);
    await db.collections.texts.insert(updated);
    return updated;
  }

  static previewTextTimeMapping(input: PreviewTextTimeMappingInput): PreviewTextTimeMappingResult {
    return previewTextTimeMappingImpl(input);
  }

  static invertTextTimeMapping(realTime: number, mapping: Pick<TextTimeMapping, 'offsetSec' | 'scale'>): number {
    return invertTextTimeMappingImpl(realTime, mapping);
  }

  static async getMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
    const db = await getDb();
    const docs = await db.collections.media_items.findByIndex('textId', textId);
    const rows = docs.map((doc) => doc.toJSON());
    const normalizedRows = rows.map((row) => withResolvedMediaItemTimelineKind(row));
    const changedRows = normalizedRows.filter((row, index) => row !== rows[index]);
    if (changedRows.length > 0) {
      await db.dexie.media_items.bulkPut(changedRows);
    }
    return normalizedRows;
  }

  static async saveMediaItem(data: MediaItemDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.media_items.insert(withResolvedMediaItemTimelineKind(data));
    return doc.primary;
  }

  static async exportToJSON(): Promise<string> {
    const snapshot = await exportDatabaseAsJson();
    return JSON.stringify(snapshot, null, 2);
  }

  static async importFromJSON(
    payload: string,
    strategy: ImportConflictStrategy = 'upsert',
  ): Promise<ImportResult> {
    return importDatabaseFromJson(payload, { strategy });
  }

  static async getTierDefinitions(...args: Parameters<(typeof import('./LinguisticService.tiers'))['getTierDefinitions']>) {
    return (await loadTierService()).getTierDefinitions(...args);
  }

  static async saveTierDefinition(...args: Parameters<(typeof import('./LinguisticService.tiers'))['saveTierDefinition']>) {
    return (await loadTierService()).saveTierDefinition(...args);
  }

  static async removeTierDefinition(...args: Parameters<(typeof import('./LinguisticService.tiers'))['removeTierDefinition']>) {
    return (await loadTierService()).removeTierDefinition(...args);
  }

  static async getTierAnnotations(...args: Parameters<(typeof import('./LinguisticService.tiers'))['getTierAnnotations']>) {
    return (await loadTierService()).getTierAnnotations(...args);
  }

  static async saveTierAnnotation(...args: Parameters<(typeof import('./LinguisticService.tiers'))['saveTierAnnotation']>) {
    return (await loadTierService()).saveTierAnnotation(...args);
  }

  static async removeTierAnnotation(...args: Parameters<(typeof import('./LinguisticService.tiers'))['removeTierAnnotation']>) {
    return (await loadTierService()).removeTierAnnotation(...args);
  }

  static async saveTierAnnotationsBatch(...args: Parameters<(typeof import('./LinguisticService.tiers'))['saveTierAnnotationsBatch']>) {
    return (await loadTierService()).saveTierAnnotationsBatch(...args);
  }

  static async getAuditLogs(...args: Parameters<(typeof import('./LinguisticService.tiers'))['getAuditLogs']>) {
    return (await loadTierService()).getAuditLogs(...args);
  }

  static async getAuditLogsByCollection(...args: Parameters<(typeof import('./LinguisticService.tiers'))['getAuditLogsByCollection']>) {
    return (await loadTierService()).getAuditLogsByCollection(...args);
  }

  static async pruneAuditLogs(...args: Parameters<(typeof import('./LinguisticService.tiers'))['pruneAuditLogs']>) {
    return (await loadTierService()).pruneAuditLogs(...args);
  }

  // ── Project initialization ─────────────────────────────────

  static async createProject(input: {
    primaryTitle: string;
    englishFallbackTitle: string;
    primaryLanguageId: string;
    primaryOrthographyId?: string;
  }): Promise<{ textId: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const textId = newId('text');
    const primaryLanguageId = input.primaryLanguageId.trim().toLowerCase();

    if (!isKnownIso639_3Code(primaryLanguageId)) {
      throw new Error('primaryLanguageId 必须是有效的 ISO 639-3 三字母代码');
    }

    await db.collections.texts.insert({
      id: textId,
      title: buildPrimaryAndEnglishLabels({
        primaryLabel: input.primaryTitle,
        englishFallbackLabel: input.englishFallbackTitle,
      }),
      metadata: {
        primaryLanguageId,
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timebaseLabel: 'logical-second',
        ...(input.primaryOrthographyId ? { primaryOrthographyId: input.primaryOrthographyId } : {}),
      },
      createdAt: now,
      updatedAt: now,
    } as TextDocType);

    return { textId };
  }

  static async createOrthography(input: CreateOrthographyInput): Promise<OrthographyDocType> {
    return (await loadOrthographyService()).createOrthographyRecord(input);
  }

  static async cloneOrthographyToLanguage(input: CloneOrthographyToLanguageInput): Promise<OrthographyDocType> {
    return (await loadOrthographyService()).cloneOrthographyRecordToLanguage(input);
  }

  static async listOrthographies(selector: ListOrthographyRecordsSelector = {}): Promise<OrthographyDocType[]> {
    return (await loadOrthographyService()).listOrthographyRecords(selector);
  }

  static async updateOrthography(input: UpdateOrthographyInput): Promise<OrthographyDocType> {
    return (await loadOrthographyService()).updateOrthographyRecord(input);
  }

  static async createOrthographyBridge(input: CreateOrthographyBridgeInput): Promise<OrthographyBridgeDocType> {
    return (await loadOrthographyService()).createOrthographyBridgeRecord(input);
  }

  static async listOrthographyBridges(
    selector: ListOrthographyBridgesSelector = {},
  ): Promise<OrthographyBridgeDocType[]> {
    return (await loadOrthographyService()).listOrthographyBridgeRecords(selector);
  }

  static async updateOrthographyBridge(input: UpdateOrthographyBridgeInput): Promise<OrthographyBridgeDocType> {
    return (await loadOrthographyService()).updateOrthographyBridgeRecord(input);
  }

  static async listLanguageCatalogEntries(input: {
    locale: 'zh-CN' | 'en-US';
    searchText?: string;
    includeHidden?: boolean;
    languageIds?: readonly string[];
  }): Promise<LanguageCatalogEntry[]> {
    return (await loadLanguageCatalogService()).listLanguageCatalogEntries(input);
  }

  static async getLanguageCatalogEntry(input: {
    languageId: string;
    locale: 'zh-CN' | 'en-US';
  }): Promise<LanguageCatalogEntry | null> {
    return (await loadLanguageCatalogService()).getLanguageCatalogEntry(input);
  }

  static async upsertLanguageCatalogEntry(input: UpsertLanguageCatalogEntryInput): Promise<LanguageCatalogEntry> {
    return (await loadLanguageCatalogService()).upsertLanguageCatalogEntry(input);
  }

  static async deleteLanguageCatalogEntry(input: {
    languageId: string;
    reason?: string;
    locale: 'zh-CN' | 'en-US';
  }): Promise<void> {
    return (await loadLanguageCatalogService()).deleteLanguageCatalogEntry(input);
  }

  static async listLanguageCatalogHistory(languageId: string) {
    return (await loadLanguageCatalogService()).listLanguageCatalogHistory(languageId);
  }

  static async listCustomFieldDefinitions() {
    return (await loadLanguageCatalogService()).listCustomFieldDefinitions();
  }

  static async upsertCustomFieldDefinition(input: Parameters<(typeof import('./LinguisticService.languageCatalog'))['upsertCustomFieldDefinition']>[0]) {
    return (await loadLanguageCatalogService()).upsertCustomFieldDefinition(input);
  }

  static async deleteCustomFieldDefinition(id: string) {
    return (await loadLanguageCatalogService()).deleteCustomFieldDefinition(id);
  }

  static async refreshLanguageCatalogReadModel(): Promise<void> {
    if (Dexie.currentTransaction) {
      if (!deferredLanguageCatalogRefreshScheduled) {
        deferredLanguageCatalogRefreshScheduled = true;
        setTimeout(() => {
          deferredLanguageCatalogRefreshScheduled = false;
          void loadLanguageCatalogService()
            .then((service) => service.refreshLanguageCatalogReadModel())
            .catch((error) => {
              console.error('Failed to refresh language catalog read model from deferred wrapper:', error);
            });
        }, 0);
      }
      return;
    }
    return (await loadLanguageCatalogService()).refreshLanguageCatalogReadModel();
  }

  /**
   * 在语言目录中搜索匹配项 | Search for matching entries in the language catalog
   */
  static searchLanguageCatalogEntries(
    query: string,
    locale?: import('../utils/langMapping').LanguageSearchLocale,
    maxResults?: number,
  ): import('../utils/langMapping').LanguageCatalogMatch[] {
    return searchLanguageCatalog(query, locale, maxResults);
  }

  /**
   * 解析用户输入为 ISO 639-3 代码 | Resolve user input to ISO 639-3 code
   */
  static resolveLanguageQuery(query: string): string | undefined {
    return resolveLanguageQueryImpl(query);
  }

  /**
   * 同步查询 ISO 639-3 种子记录（用于前端即时预填充） | Synchronously look up ISO 639-3 seed record for instant pre-fill
   */
  static lookupIso639_3Seed(code: string) {
    return lookupIso639_3Seed(code);
  }

  static async deleteOrthographyBridge(id: string): Promise<void> {
    return (await loadOrthographyService()).deleteOrthographyBridgeRecord(id);
  }

  static async getActiveOrthographyBridge(
    input: GetActiveOrthographyBridgeInput,
  ): Promise<OrthographyBridgeDocType | null> {
    return (await loadOrthographyService()).getActiveOrthographyBridgeRecord(input);
  }

  static async applyOrthographyBridge(
    input: ApplyOrthographyBridgeInput,
  ): Promise<{ text: string; bridgeId?: string }> {
    return (await loadOrthographyService()).applyOrthographyBridgeRecord(input);
  }

  static previewOrthographyBridge(input: PreviewOrthographyBridgeInput): string {
    return previewOrthographyBridgeText(input);
  }

  // ── Audio import ───────────────────────────────────────────

  static async importAudio(input: {
    textId: string;
    audioBlob: Blob;
    filename: string;
    duration: number;
    /**
     * `default`：与既有行为一致——仅占位行时晋升占位；已存在非占位声学则新建 `mediaId`。
     * `replace`：覆盖 `replaceMediaId` 指向的行（声学就地换源，或显式晋升某条占位）。
     * `add`：在已存在非占位声学时强制新建一条媒体轨；若当前仅有占位则与 `default` 相同（仍晋升占位）。
     */
    importMode?: 'default' | 'replace' | 'add';
    /** `importMode === 'replace'` 时必填，且须属于 `textId`。 */
    replaceMediaId?: string;
  }): Promise<{ mediaId: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const mode = input.importMode ?? 'default';
    const replaceMediaIdTrimmed = typeof input.replaceMediaId === 'string' ? input.replaceMediaId.trim() : '';
    if (mode === 'replace' && replaceMediaIdTrimmed.length === 0) {
      throw new Error('importAudio: replaceMediaId is required when importMode is replace');
    }
    const mediaRows = await db.dexie.media_items.where('textId').equals(input.textId).toArray();
    const hasPlayablePayload = (row: MediaItemDocType): boolean => {
      const details = (row.details as Record<string, unknown> | undefined) ?? {};
      return details.audioBlob instanceof Blob
        || (typeof row.url === 'string' && row.url.trim().length > 0);
    };
    const placeholderRows = mediaRows.filter((row) => (
      isMediaItemPlaceholderRow(row)
      || (!isAuxiliaryRecordingMediaRow(row) && !hasPlayablePayload(row))
    ));
    const timelineAcousticRows = mediaRows.filter((row) => (
      !placeholderRows.some((candidate) => candidate.id === row.id)
      && !isAuxiliaryRecordingMediaRow(row)
    ));

    const refreshMediaTimelineMetadata = async (_mediaId: string) => {
      const textRow = await db.dexie.texts.get(input.textId);
      if (!textRow) return;
      const rowMeta = (textRow.metadata as Record<string, unknown> | undefined) ?? {};
      const prevLogical = typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
        ? rowMeta.logicalDurationSec
        : 0;
      const nextLogical = Math.max(prevLogical, input.duration);
      await db.dexie.texts.put({
        ...textRow,
        metadata: {
          ...rowMeta,
          timelineMode: 'media',
          ...(nextLogical > 0 ? { logicalDurationSec: nextLogical } : {}),
        },
        updatedAt: now,
      });
    };

    if (mode === 'replace') {
      const targetRow = mediaRows.find((r) => r.id === replaceMediaIdTrimmed);
      if (!targetRow || targetRow.textId !== input.textId) {
        throw new Error('importAudio: replaceMediaId must refer to a media item in this text');
      }
      if (!isMediaItemPlaceholderRow(targetRow)) {
        const previousDetails = (targetRow.details as Record<string, unknown> | undefined) ?? {};
        const {
          placeholder: _placeholder,
          timelineMode: _timelineMode,
          timelineKind: _timelineKind,
          audioBlob: _oldAudioBlob,
          ...remainingDetails
        } = previousDetails;
        await db.dexie.media_items.put({
          id: targetRow.id,
          textId: input.textId,
          filename: input.filename,
          duration: input.duration,
          details: {
            ...remainingDetails,
            audioBlob: input.audioBlob,
            timelineKind: MEDIA_TIMELINE_KIND_ACOUSTIC,
          },
          isOfflineCached: targetRow.isOfflineCached,
          ...(targetRow.accessRights ? { accessRights: targetRow.accessRights } : {}),
          createdAt: targetRow.createdAt,
        });
        await refreshMediaTimelineMetadata(targetRow.id);
        return { mediaId: targetRow.id };
      }
    }

    const shouldPromotePlaceholders = placeholderRows.length > 0
      && (
        (mode === 'default' && timelineAcousticRows.length === 0)
        || (mode === 'replace' && placeholderRows.some((p) => p.id === replaceMediaIdTrimmed))
        || (mode === 'add' && timelineAcousticRows.length === 0)
      );

    let mediaId = newId('media');
    let createdAt = now;
    let mergedDetails: Record<string, unknown> = {};
    let accessRights: MediaItemDocType['accessRights'] | undefined;
    let isOfflineCached = true;

    if (shouldPromotePlaceholders) {
      let primaryPlaceholder: MediaItemDocType;
      if (mode === 'replace' && placeholderRows.some((p) => p.id === replaceMediaIdTrimmed)) {
        primaryPlaceholder = placeholderRows.find((p) => p.id === replaceMediaIdTrimmed)!;
      } else {
        const placeholderCounts = await Promise.all(placeholderRows.map(async (row) => ({
          row,
          count: await LayerSegmentQueryService.countUnitsByMediaId(row.id),
        })));
        placeholderCounts.sort((a, b) => b.count - a.count);
        primaryPlaceholder = placeholderCounts[0]?.row ?? placeholderRows[0]!;
      }
      mediaId = primaryPlaceholder.id;
      createdAt = primaryPlaceholder.createdAt;
      accessRights = primaryPlaceholder.accessRights;
      isOfflineCached = primaryPlaceholder.isOfflineCached;
      const previousDetails = (primaryPlaceholder.details as Record<string, unknown> | undefined) ?? {};
      const {
        placeholder: _placeholder,
        timelineMode: _timelineMode,
        timelineKind: _timelineKind,
        audioBlob: _oldAudioBlob,
        ...remainingDetails
      } = previousDetails;
      mergedDetails = remainingDetails;

      const stalePlaceholderIds = placeholderRows
        .filter((row) => row.id !== mediaId)
        .map((row) => row.id);
      if (stalePlaceholderIds.length > 0) {
        const staleUnits = await LayerSegmentQueryService.listUnitsByMediaIds(stalePlaceholderIds);
        if (staleUnits.length > 0) {
          await LayerUnitSegmentWriteService.reassignUnitsToMediaId(db, staleUnits, mediaId, now);
        }
        await db.dexie.media_items.bulkDelete(stalePlaceholderIds);
      }
    }

    await db.dexie.media_items.put({
      id: mediaId,
      textId: input.textId,
      filename: input.filename,
      duration: input.duration,
      details: {
        ...mergedDetails,
        audioBlob: input.audioBlob,
        timelineKind: MEDIA_TIMELINE_KIND_ACOUSTIC,
      },
      isOfflineCached,
      ...(accessRights ? { accessRights } : {}),
      createdAt,
    });

    let remapResult = { didRemap: false, maxUnitEnd: 0 };
    if (shouldPromotePlaceholders) {
      remapResult = await remapLayerUnitsAndAnchorsForFirstAcousticImport({
        db,
        textId: input.textId,
        mediaId,
        acousticDurationSec: input.duration,
        now,
      });
    }

    const textRowAfterPut = await db.dexie.texts.get(input.textId);
    if (textRowAfterPut) {
      const rowMetaAfter = (textRowAfterPut.metadata as Record<string, unknown> | undefined) ?? {};
      const prevLogicalAfter = typeof rowMetaAfter.logicalDurationSec === 'number' && Number.isFinite(rowMetaAfter.logicalDurationSec)
        ? rowMetaAfter.logicalDurationSec
        : 0;
      const nextLogicalAfter = remapResult.didRemap
        ? Math.max(input.duration, remapResult.maxUnitEnd, 1)
        : Math.max(prevLogicalAfter, input.duration);
      await db.dexie.texts.put({
        ...textRowAfterPut,
        metadata: {
          ...rowMetaAfter,
          timelineMode: 'media',
          ...(nextLogicalAfter > 0 ? { logicalDurationSec: nextLogicalAfter } : {}),
        },
        updatedAt: now,
      });
    }

    return { mediaId };
  }

  static async createPlaceholderMedia(input: {
    textId: string;
    duration?: number;
    filename?: string;
  }): Promise<MediaItemDocType> {
    const db = await getDb();
    const now = new Date().toISOString();
    const mediaId = newId('media');
    const duration = Number.isFinite(input.duration) && (input.duration ?? 0) > 0
      ? (input.duration as number)
      : 1800;
    const filename = input.filename?.trim() || 'document-placeholder.track';

    const mediaItem: MediaItemDocType = {
      id: mediaId,
      textId: input.textId,
      filename,
      duration,
      details: {
        placeholder: true,
        timelineMode: 'document',
        timelineKind: MEDIA_TIMELINE_KIND_PLACEHOLDER,
      },
      isOfflineCached: true,
      createdAt: now,
    };

    await db.collections.media_items.insert(mediaItem);
    return mediaItem;
  }

  /**
   * 显式扩展 `texts.metadata.logicalDurationSec` 至不小于给定值（ADR-0004 决策 2 选项 C，7C 最小闭环）。
   * **不**修改 `layer_units` 坐标；不缩放声学时间轴。
   */
  static async expandTextLogicalDurationToAtLeast(input: {
    textId: string;
    minLogicalDurationSec: number;
  }): Promise<void> {
    const db = await getDb();
    const textRow = await db.dexie.texts.get(input.textId);
    if (!textRow) return;
    const minSec = Number.isFinite(input.minLogicalDurationSec) && input.minLogicalDurationSec > 0
      ? input.minLogicalDurationSec
      : 0;
    if (minSec <= 0) return;
    const rowMeta = (textRow.metadata as Record<string, unknown> | undefined) ?? {};
    const prev = typeof rowMeta.logicalDurationSec === 'number' && Number.isFinite(rowMeta.logicalDurationSec)
      ? rowMeta.logicalDurationSec
      : 0;
    const next = Math.max(prev, minSec);
    if (next <= prev) return;
    const now = new Date().toISOString();
    await db.dexie.texts.put({
      ...textRow,
      metadata: {
        ...rowMeta,
        logicalDurationSec: next,
      },
      updatedAt: now,
    });
  }

  /** Delete a project (text) and all associated data (cascade). */
  static async deleteProject(textId: string): Promise<void> {
    await deleteProjectCascade(textId);
  }

  /**
   * 删除声学音频，但保留文本时间线与语段行 | Remove the acoustic audio while preserving the text timeline and segment rows.
   */
  static async deleteAudio(mediaId: string): Promise<void> {
    await deleteAudioPreserveTimeline(mediaId);
  }

  /** Delete a single unit and cascade-delete its translations + lexicon links + anchors. */
  static async removeUnit(unitId: string): Promise<void> {
    await removeUnitCascade(unitId);
  }

  /**
   * Delete multiple units in one transaction with the same cascade semantics
   * as removeUnit (V2 segments, token_lexeme_links, anchors).
   */
  static async removeUnitsBatch(unitIds: readonly string[]): Promise<void> {
    await removeUnitsBatchCascade(unitIds);
  }

}
