import { getDb, exportDatabaseAsJson, importDatabaseFromJson, type ImportConflictStrategy, type ImportResult, type LayerUnitDocType, type UnitTokenDocType, type UnitMorphemeDocType, type TokenLexemeLinkDocType, type TokenLexemeLinkTargetType, type LexemeDocType, type LayerDocType, type LayerUnitContentDocType, type TextDocType, type MediaItemDocType, type OrthographyDocType, type OrthographyBridgeDocType, type SpeakerDocType } from '../db';
import { syncLayerToTier } from './TierBridgeService';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { newId } from '../../src/utils/transcriptionFormatters';
import { normalizeUnitDocForStorage } from '../../src/utils/camDataUtils';
import { enforceTimeSubdivisionParentBounds, listUnitTextsFromSegmentation, listUnitTextsByUnit, removeUnitCascadeFromSegmentationV2, syncUnitTextToSegmentationV2 } from './LayerSegmentationTextService';
import { buildPrimaryAndEnglishLabels } from '../utils/multiLangLabels';
import type { SpeakerReferenceStatsBundle } from '../hooks/speakerManagement/types';
import { hasEmbeddedDefaultTextChanged, invalidateUnitEmbeddings, isDefaultTranscriptionLayerForUnitText } from '../ai/embeddings/EmbeddingInvalidationService';
import { bulkUpsertUnitLayerUnits, deleteResidualLayerUnitGraphByMediaId, deleteResidualLayerUnitGraphByTextId, deleteUnitLayerUnitCascade, getUnitDocProjectionById, listUnitDocsFromCanonicalLayerUnits, upsertUnitLayerUnit } from './LayerSegmentGraphService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { type ImportQualityReport } from './LinguisticService.constraints';
import type { ApplyOrthographyBridgeInput, CloneOrthographyToLanguageInput, CreateOrthographyInput, CreateOrthographyBridgeInput, GetActiveOrthographyBridgeInput, ListOrthographyRecordsSelector, ListOrthographyBridgesSelector, PreviewOrthographyBridgeInput, UpdateOrthographyInput, UpdateOrthographyBridgeInput } from './LinguisticService.orthography';
import type { LanguageCatalogEntry, UpsertLanguageCatalogEntryInput } from './LinguisticService.languageCatalog';
import { lookupIso639_3Seed } from './languageCatalogSeedLookup';
import { SegmentMetaService } from './SegmentMetaService';
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

export class LinguisticService {
  private static async removeNotesForUnitIds(
    db: Awaited<ReturnType<typeof getDb>>,
    unitIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;

    const [tokens, morphemes] = await Promise.all([
      db.dexie.unit_tokens.where('unitId').anyOf(ids).toArray(),
      db.dexie.unit_morphemes.where('unitId').anyOf(ids).toArray(),
    ]);

    const deleteByTarget = async (targetType: 'unit' | 'token' | 'morpheme', targetIds: readonly string[]) => {
      if (targetIds.length === 0) return;
      await db.dexie.user_notes
        .where('[targetType+targetId]')
        .anyOf(targetIds.map((targetId) => [targetType, targetId] as [string, string]))
        .delete();
    };

    await deleteByTarget('unit', ids);
    await deleteByTarget('token', tokens.map((token) => token.id));
    await deleteByTarget('morpheme', morphemes.map((morpheme) => morpheme.id));
  }

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

  static async saveText(data: TextDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.texts.insert(data);
    return doc.primary;
  }

  static async getMediaItemsByTextId(textId: string): Promise<MediaItemDocType[]> {
    const db = await getDb();
    const docs = await db.collections.media_items.findByIndex('textId', textId);
    return docs.map((doc) => doc.toJSON());
  }

  static async saveMediaItem(data: MediaItemDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.media_items.insert(data);
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
  }): Promise<{ mediaId: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const mediaId = newId('media');

    await db.collections.media_items.insert({
      id: mediaId,
      textId: input.textId,
      filename: input.filename,
      duration: input.duration,
      details: { audioBlob: input.audioBlob },
      isOfflineCached: true,
      createdAt: now,
    });

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
      },
      isOfflineCached: true,
      createdAt: now,
    };

    await db.collections.media_items.insert(mediaItem);
    return mediaItem;
  }

  /** Delete a project (text) and all associated data (cascade). */
  static async deleteProject(textId: string): Promise<void> {
    const db = await getDb();

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.unit_tokens,
        db.dexie.unit_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.tier_annotations,
        db.dexie.tier_definitions,
        db.dexie.media_items,
        db.dexie.anchors,
        db.dexie.ai_conversations,
        db.dexie.ai_messages,
        db.dexie.ai_tasks,
        db.dexie.segment_meta,
        db.dexie.segment_quality_snapshots,
        db.dexie.scope_stats_snapshots,
        db.dexie.speaker_profile_snapshots,
        db.dexie.translation_status_snapshots,
        db.dexie.ai_task_snapshots,
        db.dexie.track_entities,
        db.dexie.texts,
      ],
      async () => {
        const allUtts = await db.dexie.layer_units.where('textId').equals(textId).filter((u) => u.unitType === 'unit').toArray();
        const uttIds = allUtts.map((u) => u.id);

        await this.removeNotesForUnitIds(db, uttIds);
        await invalidateUnitEmbeddings(db, uttIds);

        for (const uttId of uttIds) {
          const tokens = await db.dexie.unit_tokens.where('unitId').equals(uttId).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(uttId).toArray()).map((m) => m.id);
          await removeUnitCascadeFromSegmentationV2(db, uttId);
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.unit_tokens.where('unitId').equals(uttId).delete();
          await db.dexie.unit_morphemes.where('unitId').equals(uttId).delete();
        }

        await deleteResidualLayerUnitGraphByTextId(db, textId);

        const tierDefs = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
        for (const td of tierDefs) {
          await db.dexie.tier_annotations.where('tierId').equals(td.id).delete();
        }

        await db.dexie.tier_definitions.where('textId').equals(textId).delete();

        // Cascade: anchors belonging to media of this text
        const mediaItems = await db.dexie.media_items.where('textId').equals(textId).toArray();
        for (const m of mediaItems) {
          await db.dexie.anchors.where('mediaId').equals(m.id).delete();
        }

        await db.dexie.media_items.where('textId').equals(textId).delete();

        // 级联清理 AI 对话与消息 | Cascade: AI conversations and messages scoped to this text
        const convos = await db.dexie.ai_conversations.where('textId').equals(textId).toArray();
        const convoIds = convos.map((c) => c.id);
        for (const convoId of convoIds) {
          await db.dexie.ai_messages.where('conversationId').equals(convoId).delete();
        }
        if (convoIds.length > 0) {
          await db.dexie.ai_conversations.bulkDelete(convoIds);
        }

        // 级联清理轨道实体 | Cascade: track entities scoped to this text
        await db.dexie.track_entities.where('textId').equals(textId).delete();

        // 级联清理统一读模型 / 快照表 | Cascade the derived read-model tables for this text
        await Promise.all([
          db.dexie.segment_meta.where('textId').equals(textId).delete(),
          db.dexie.segment_quality_snapshots.where('textId').equals(textId).delete(),
          db.dexie.scope_stats_snapshots.where('textId').equals(textId).delete(),
          db.dexie.speaker_profile_snapshots.where('textId').equals(textId).delete(),
          db.dexie.translation_status_snapshots.where('textId').equals(textId).delete(),
        ]);

        // 级联清理 AI 任务 | Cascade: AI tasks targeting this text
        await db.dexie.ai_tasks.where('targetId').equals(textId).delete();
        await db.dexie.ai_task_snapshots.where('targetId').equals(textId).delete();

        await db.dexie.texts.delete(textId);
      },
    );
  }

  /** Delete a media item and its associated units + translations + anchors (cascade). */
  static async deleteAudio(mediaId: string): Promise<void> {
    const db = await getDb();

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.unit_tokens,
        db.dexie.unit_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.anchors,
        db.dexie.media_items,
        db.dexie.segment_meta,
        db.dexie.segment_quality_snapshots,
        db.dexie.scope_stats_snapshots,
        db.dexie.translation_status_snapshots,
      ],
      async () => {
        const utts = await db.dexie.layer_units.where('mediaId').equals(mediaId).filter((u) => u.unitType === 'unit').toArray();
        const uttIds = utts.map((u) => u.id);

        await this.removeNotesForUnitIds(db, uttIds);
        await invalidateUnitEmbeddings(db, uttIds);

        for (const u of utts) {
          const tokens = await db.dexie.unit_tokens.where('unitId').equals(u.id).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(u.id).toArray()).map((m) => m.id);
          await removeUnitCascadeFromSegmentationV2(db, u.id);
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.unit_tokens.where('unitId').equals(u.id).delete();
          await db.dexie.unit_morphemes.where('unitId').equals(u.id).delete();
        }

        await deleteResidualLayerUnitGraphByMediaId(db, mediaId);
        await Promise.all([
          db.dexie.segment_meta.where('mediaId').equals(mediaId).delete(),
          db.dexie.segment_quality_snapshots.where('mediaId').equals(mediaId).delete(),
          db.dexie.scope_stats_snapshots.where('mediaId').equals(mediaId).delete(),
          db.dexie.translation_status_snapshots.where('mediaId').equals(mediaId).delete(),
        ]);
        await db.dexie.anchors.where('mediaId').equals(mediaId).delete();
        await db.dexie.media_items.delete(mediaId);
      },
    );
  }

  /** Delete a single unit and cascade-delete its translations + lexicon links + anchors. */
  static async removeUnit(unitId: string): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.unit_tokens,
        db.dexie.unit_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.anchors,
      ],
      async () => {
        await this.removeNotesForUnitIds(db, [unitId]);
        await invalidateUnitEmbeddings(db, [unitId]);

        const utt = await db.dexie.layer_units.get(unitId);
        const tokens = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
        const tokenIds = tokens.map((t) => t.id);
        const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()).map((m) => m.id);

        await removeUnitCascadeFromSegmentationV2(db, unitId);
        if (tokenIds.length > 0 || morphemeIds.length > 0) {
          const targets: Array<[string, string]> = [
            ...tokenIds.map((id) => ['token', id] as [string, string]),
            ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
          ];
          await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
        }
        await db.dexie.unit_tokens.where('unitId').equals(unitId).delete();
        await db.dexie.unit_morphemes.where('unitId').equals(unitId).delete();
        await deleteUnitLayerUnitCascade(db, [unitId]);

        // Cleanup owned anchors
        if (utt?.unitType === 'unit') {
          if (utt.startAnchorId) await db.dexie.anchors.delete(utt.startAnchorId);
          if (utt.endAnchorId) await db.dexie.anchors.delete(utt.endAnchorId);
        }
      },
    );
    void SegmentMetaService.syncForUnitIds([unitId]).catch(() => {
      // SegmentMeta 为统一读模型，删除后的刷新失败不应阻塞主流程 | SegmentMeta is a shared read model; delete-sync failures must not block the primary flow.
    });
  }

  /**
   * Delete multiple units in one transaction with the same cascade semantics
    * as removeUnit (V2 segments, token_lexeme_links, anchors).
   */
  static async removeUnitsBatch(unitIds: readonly string[]): Promise<void> {
    const ids = [...new Set(unitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;

    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.unit_tokens,
        db.dexie.unit_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.anchors,
      ],
      async () => {
        const bulkRows = await db.dexie.layer_units.bulkGet(ids);
        const utts = bulkRows.filter((row): row is LayerUnitDocType & { unitType: 'unit' } => (
          row != null && row.unitType === 'unit'
        ));

        await this.removeNotesForUnitIds(db, ids);
        await invalidateUnitEmbeddings(db, ids);

        for (const unitId of ids) {
          const tokens = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.unit_morphemes.where('unitId').equals(unitId).toArray()).map((m) => m.id);
          await removeUnitCascadeFromSegmentationV2(db, unitId);
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.unit_tokens.where('unitId').equals(unitId).delete();
          await db.dexie.unit_morphemes.where('unitId').equals(unitId).delete();
        }

        await deleteUnitLayerUnitCascade(db, ids);

        const anchorIds = new Set<string>();
        for (const utt of utts) {
          if (utt.startAnchorId) anchorIds.add(utt.startAnchorId);
          if (utt.endAnchorId) anchorIds.add(utt.endAnchorId);
        }

        if (anchorIds.size > 0) {
          await db.dexie.anchors.bulkDelete([...anchorIds]);
        }
      },
    );
    void SegmentMetaService.syncForUnitIds(ids).catch(() => {
      // SegmentMeta 为统一读模型，批量删除后的刷新失败不应阻塞主流程 | SegmentMeta is a shared read model; delete-sync failures must not block the primary flow.
    });
  }

}
