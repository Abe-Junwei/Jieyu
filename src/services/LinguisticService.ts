import {
  getDb,
  exportDatabaseAsJson,
  importDatabaseFromJson,
  type ImportConflictStrategy,
  type ImportResult,
  type UtteranceDocType,
  type UtteranceTokenDocType,
  type UtteranceMorphemeDocType,
  type TokenLexemeLinkDocType,
  type TokenLexemeLinkTargetType,
  type LexemeDocType,
  type LayerDocType,
  type UtteranceTextDocType,
  type TextDocType,
  type MediaItemDocType,
  type TierDefinitionDocType,
  type TierAnnotationDocType,
  type AuditLogDocType,
  type AuditSource,
  type AnchorDocType,
  type MultiLangString,
  type OrthographyDocType,
  type OrthographyTransformDocType,
  type SpeakerDocType,
} from '../db';
import { newId } from '../../src/utils/transcriptionFormatters';
import { previewOrthographyTransform } from '../utils/orthographyTransforms';
import {
  assertReviewProtection,
  assertStableId,
  normalizeTierAnnotationDocForStorage,
  normalizeUtteranceDocForStorage,
} from '../../src/utils/camDataUtils';
import {
  enforceTimeSubdivisionParentBounds,
  listUtteranceTextsFromSegmentation,
  listUtteranceTextsByUtterance,
  removeUtteranceCascadeFromSegmentationV2,
  syncUtteranceTextToSegmentationV2,
} from './LayerSegmentationTextService';
import {
  hasEmbeddedDefaultTextChanged,
  invalidateUtteranceEmbeddings,
  isDefaultTranscriptionLayerForUtteranceText,
} from '../ai/embeddings/EmbeddingInvalidationService';
import {
  bulkUpsertUtteranceLayerUnits,
  deleteResidualLayerUnitGraphByMediaId,
  deleteResidualLayerUnitGraphByTextId,
  deleteUtteranceLayerUnitCascade,
  upsertUtteranceLayerUnit,
} from './LayerSegmentGraphService';
import { LegacyMirrorService } from './LegacyMirrorService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import {
  type ConstraintSeverity,
  type ConstraintViolation,
  type ImportQualityReport,
  type TierSaveResult,
  validateTierConstraints,
} from './LinguisticService.constraints';

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
  OrthographyTransformDocType,
} from '../db';

// ── Audit log infrastructure ──────────────────────────────────

/** Fields tracked per collection. Only changes to these fields generate audit entries. */
const TRACKED_FIELDS: Record<string, readonly string[]> = {
  tier_annotations: ['value', 'startTime', 'endTime', 'startAnchorId', 'endAnchorId', 'isVerified', 'parentAnnotationId'],
  tier_definitions: ['parentTierId', 'tierType', 'contentType', 'name'],
  utterances: ['transcription', 'startTime', 'endTime'],
};

let auditIdCounter = 0;

function generateAuditId(): string {
  return `audit_${Date.now()}_${++auditIdCounter}`;
}

function stringify(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function writeAuditLog(
  collection: string,
  documentId: string,
  action: AuditLogDocType['action'],
  source: AuditSource,
  changes?: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>,
): Promise<void> {
  const db = await getDb();
  const timestamp = new Date().toISOString();

  if (action === 'create' || action === 'delete' || !changes || changes.length === 0) {
    await db.collections.audit_logs.insert({
      id: generateAuditId(),
      collection,
      documentId,
      action,
      source,
      timestamp,
    });
    return;
  }

  for (const change of changes) {
    await db.collections.audit_logs.insert({
      id: generateAuditId(),
      collection,
      documentId,
      action,
      field: change.field,
      oldValue: stringify(change.oldValue),
      newValue: stringify(change.newValue),
      source,
      timestamp,
    });
  }
}

function diffTrackedFields(
  collection: string,
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const fields = TRACKED_FIELDS[collection];
  if (!fields) return [];
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  for (const field of fields) {
    const ov = stringify(oldDoc[field]);
    const nv = stringify(newDoc[field]);
    if (ov !== nv) {
      changes.push({ field, oldValue: oldDoc[field], newValue: newDoc[field] });
    }
  }
  return changes;
}

export class LinguisticService {
  private static async removeNotesForUtteranceIds(
    db: Awaited<ReturnType<typeof getDb>>,
    utteranceIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(utteranceIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;

    const tokens = await (async () => {
      try {
        return await db.dexie.utterance_tokens.where('utteranceId').anyOf(ids).toArray();
      } catch {
        const all = await db.dexie.utterance_tokens.toArray();
        const idSet = new Set(ids);
        return all.filter((row) => idSet.has(row.utteranceId));
      }
    })();

    const morphemes = await (async () => {
      try {
        return await db.dexie.utterance_morphemes.where('utteranceId').anyOf(ids).toArray();
      } catch {
        const all = await db.dexie.utterance_morphemes.toArray();
        const idSet = new Set(ids);
        return all.filter((row) => idSet.has(row.utteranceId));
      }
    })();

    const deleteByTarget = async (targetType: 'utterance' | 'token' | 'morpheme', targetIds: readonly string[]) => {
      if (targetIds.length === 0) return;
      try {
        await db.dexie.user_notes
          .where('[targetType+targetId]')
          .anyOf(targetIds.map((targetId) => [targetType, targetId] as [string, string]))
          .delete();
      } catch {
        const allNotes = await db.dexie.user_notes.toArray();
        const targetSet = new Set(targetIds);
        const noteIds = allNotes
          .filter((note) => note.targetType === targetType && targetSet.has(note.targetId))
          .map((note) => note.id);
        if (noteIds.length > 0) {
          await db.dexie.user_notes.bulkDelete(noteIds);
        }
      }
    };

    await deleteByTarget('utterance', ids);
    await deleteByTarget('token', tokens.map((token) => token.id));
    await deleteByTarget('morpheme', morphemes.map((morpheme) => morpheme.id));
  }

  static async generateImportQualityReport(textId?: string): Promise<ImportQualityReport> {
    const db = await getDb();

    const [utterancesAll, utteranceTextsAll, layersAll, tokensAll, morphemesAll, userNotesAll, anchorsAll] = await Promise.all([
      db.dexie.utterances.toArray(),
      listUtteranceTextsFromSegmentation(db),
      db.collections.layers.find().exec().then((docs) => docs.map((doc) => doc.toJSON())),
      db.dexie.utterance_tokens.toArray(),
      db.dexie.utterance_morphemes.toArray(),
      db.dexie.user_notes.toArray(),
      db.dexie.anchors.toArray(),
    ]);

    const inScopeUtterances = textId
      ? utterancesAll.filter((u) => u.textId === textId)
      : utterancesAll;
    const inScopeUtteranceIds = new Set(inScopeUtterances.map((u) => u.id));

    const inScopeUtteranceTexts = utteranceTextsAll.filter((row) => inScopeUtteranceIds.has(row.utteranceId));
    const inScopeTokens = tokensAll.filter((row) => inScopeUtteranceIds.has(row.utteranceId));
    const inScopeMorphemes = morphemesAll.filter((row) => inScopeUtteranceIds.has(row.utteranceId));

    const inScopeTokenIds = new Set(inScopeTokens.map((t) => t.id));
    const inScopeMorphemeIds = new Set(inScopeMorphemes.map((m) => m.id));
    const inScopeTranslationIds = new Set(inScopeUtteranceTexts.map((t) => t.id));

    const inScopeNotes = userNotesAll.filter((note) => {
      if (!textId) return true;
      if (note.targetType === 'utterance') return inScopeUtteranceIds.has(note.targetId);
      if (note.targetType === 'translation') return inScopeTranslationIds.has(note.targetId);
      if (note.targetType === 'token') {
        return inScopeTokenIds.has(note.targetId)
          || (typeof note.parentTargetId === 'string' && inScopeUtteranceIds.has(note.parentTargetId));
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

    for (const utt of inScopeUtterances) {
      const legacyTr = utt.transcription?.default;
      if (typeof legacyTr === 'string' && legacyTr.trim().length > 0) {
        transcribedUttIds.add(utt.id);
      }
      if (utt.annotationStatus === 'verified') {
        verifiedUttIds.add(utt.id);
      }
    }

    for (const row of inScopeUtteranceTexts) {
      const text = row.text?.trim() ?? '';
      if (!text) continue;
      const layerType = layerTypeById.get(row.layerId);
      if (layerType === 'transcription') transcribedUttIds.add(row.utteranceId);
      if (layerType === 'translation') translatedUttIds.add(row.utteranceId);
    }

    for (const token of inScopeTokens) {
      if (token.gloss && Object.keys(token.gloss).length > 0) {
        glossedUttIds.add(token.utteranceId);
        continue;
      }
      if (token.pos && token.pos.trim().length > 0) {
        glossedUttIds.add(token.utteranceId);
      }
    }
    for (const morph of inScopeMorphemes) {
      if (morph.gloss && Object.keys(morph.gloss).length > 0) {
        glossedUttIds.add(morph.utteranceId);
        continue;
      }
      if (morph.pos && morph.pos.trim().length > 0) {
        glossedUttIds.add(morph.utteranceId);
      }
    }

    const utteranceById = new Set(inScopeUtterances.map((u) => u.id));
    const tokenById = new Set(inScopeTokens.map((u) => u.id));
    const morphemeById = new Set(inScopeMorphemes.map((u) => u.id));
    const translationById = new Set(inScopeUtteranceTexts.map((u) => u.id));

    let orphanNotes = 0;
    for (const note of inScopeNotes) {
      if (note.targetType === 'utterance' && !utteranceById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'token' && !tokenById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'morpheme' && !morphemeById.has(note.targetId)) orphanNotes++;
      if (note.targetType === 'translation' && !translationById.has(note.targetId)) orphanNotes++;
    }

    const referencedAnchors = new Set<string>();
    for (const utt of inScopeUtterances) {
      if (utt.startAnchorId) referencedAnchors.add(utt.startAnchorId);
      if (utt.endAnchorId) referencedAnchors.add(utt.endAnchorId);
    }
    let orphanAnchors = 0;
    for (const anchor of anchorsAll) {
      if (!referencedAnchors.has(anchor.id)) orphanAnchors++;
    }

    const totalUtterances = inScopeUtterances.length;
    const ratio = (part: number): number => (totalUtterances === 0 ? 0 : part / totalUtterances);

    const transcriptionLayers = layersAll.filter((l) => l.layerType === 'transcription');
    const translationLayers = layersAll.filter((l) => l.layerType === 'translation');
    const inScopeTextIds = new Set(inScopeUtterances.map((u) => u.textId));

    return {
      generatedAt: new Date().toISOString(),
      scope: textId ? { textId } : {},
      totals: {
        utterances: totalUtterances,
        utteranceTexts: inScopeUtteranceTexts.length,
        transcriptionLayers: transcriptionLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
        translationLayers: translationLayers.filter((l) => inScopeTextIds.has(l.textId)).length,
        canonicalTokens: inScopeTokens.length,
        canonicalMorphemes: inScopeMorphemes.length,
        userNotes: inScopeNotes.length,
      },
      coverage: {
        transcribedUtterances: transcribedUttIds.size,
        translatedUtterances: translatedUttIds.size,
        glossedUtterances: glossedUttIds.size,
        verifiedUtterances: verifiedUttIds.size,
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

  static async getAllUtterances(): Promise<UtteranceDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterances.find().exec();
    return docs.map((doc) => doc.toJSON());
  }

  static async getUtteranceAtTime(time: number): Promise<UtteranceDocType | undefined> {
    const db = await getDb();
    const docs = await db.collections.utterances.find().exec();
    return docs.map((doc) => doc.toJSON()).find((u) => u.startTime <= time && u.endTime >= time);
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

  static async getSpeakerReferenceStats(): Promise<Record<string, { utteranceCount: number; segmentCount: number; totalCount: number }>> {
    const db = await getDb();
    const [utteranceDocs, segments] = await Promise.all([
      db.collections.utterances.find().exec(),
      LayerSegmentQueryService.listAllSegments(),
    ]);

    const stats = new Map<string, { utteranceCount: number; segmentCount: number; totalCount: number }>();

    const ensure = (speakerId: string) => {
      const normalizedId = speakerId.trim();
      if (!normalizedId) return null;
      const existing = stats.get(normalizedId);
      if (existing) return existing;
      const next = { utteranceCount: 0, segmentCount: 0, totalCount: 0 };
      stats.set(normalizedId, next);
      return next;
    };

    for (const doc of utteranceDocs) {
      const speakerId = doc.toJSON().speakerId?.trim();
      if (!speakerId) continue;
      const target = ensure(speakerId);
      if (!target) continue;
      target.utteranceCount += 1;
      target.totalCount += 1;
    }

    for (const segment of segments) {
      const speakerId = segment.speakerId?.trim();
      if (!speakerId) continue;
      const target = ensure(speakerId);
      if (!target) continue;
      target.segmentCount += 1;
      target.totalCount += 1;
    }

    return Object.fromEntries(stats.entries());
  }

  static async createSpeaker(input: {
    name: string;
    pseudonym?: string;
    role?: SpeakerDocType['role'];
  }): Promise<SpeakerDocType> {
    const db = await getDb();
    const name = input.name.trim();
    if (!name) throw new Error('说话人名称不能为空');

    const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
    const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
    const duplicate = existingSpeakers.find((speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName);
    if (duplicate) throw new Error(`说话人已存在: ${duplicate.name}`);

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
    if (!id) throw new Error('说话人 ID 不能为空');
    if (!name) throw new Error('说话人名称不能为空');

    const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
    if (!speakerDoc) throw new Error(`说话人不存在: ${id}`);

    const normalizedName = name.toLocaleLowerCase('zh-Hans-CN');
    const existingSpeakers = (await db.collections.speakers.find().exec()).map((doc) => doc.toJSON());
    const duplicate = existingSpeakers.find((speaker) => (
      speaker.id !== id && speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName
    ));
    if (duplicate) throw new Error(`说话人已存在: ${duplicate.name}`);

    const current = speakerDoc.toJSON();
    const now = new Date().toISOString();
    const updated: SpeakerDocType = {
      ...current,
      name,
      updatedAt: now,
    };
    await db.collections.speakers.insert(updated);

    const utterances = await db.collections.utterances.findByIndex('speakerId', id);
    if (utterances.length > 0) {
      const normalized = utterances.map((doc) => {
        const row = doc.toJSON();
        return normalizeUtteranceDocForStorage({
          ...row,
          speaker: name,
          updatedAt: now,
        });
      });
      await db.collections.utterances.bulkInsert(normalized);
    }

    return updated;
  }

  static async mergeSpeakers(sourceSpeakerId: string, targetSpeakerId: string): Promise<number> {
    const db = await getDb();
    const sourceId = sourceSpeakerId.trim();
    const targetId = targetSpeakerId.trim();
    if (!sourceId || !targetId) throw new Error('说话人 ID 不能为空');
    if (sourceId === targetId) return 0;

    const [sourceDoc, targetDoc] = await Promise.all([
      db.collections.speakers.findOne({ selector: { id: sourceId } }).exec(),
      db.collections.speakers.findOne({ selector: { id: targetId } }).exec(),
    ]);

    if (!sourceDoc) throw new Error(`来源说话人不存在: ${sourceId}`);
    if (!targetDoc) throw new Error(`目标说话人不存在: ${targetId}`);

    const target = targetDoc.toJSON();
    const now = new Date().toISOString();
    const utterances = await db.collections.utterances.findByIndex('speakerId', sourceId);
    const segments = (await LayerSegmentQueryService.listAllSegments())
      .filter((segment) => segment.speakerId?.trim() === sourceId);

    if (utterances.length > 0) {
      const normalized = utterances.map((doc) => {
        const row = doc.toJSON();
        return normalizeUtteranceDocForStorage({
          ...row,
          speakerId: target.id,
          speaker: target.name,
          updatedAt: now,
        });
      });
      await db.collections.utterances.bulkInsert(normalized);
    }

    if (segments.length > 0) {
      const normalizedSegments = segments.map((segment) => ({
        ...segment,
        speakerId: target.id,
        updatedAt: now,
      }));
      await LegacyMirrorService.upsertSegments(db, normalizedSegments);
    }

    await db.collections.speakers.remove(sourceId);
    return utterances.length + segments.length;
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
    if (!id) throw new Error('说话人 ID 不能为空');

    const strategy = options.strategy ?? 'reject';
    const speakerDoc = await db.collections.speakers.findOne({ selector: { id } }).exec();
    if (!speakerDoc) throw new Error(`说话人不存在: ${id}`);

    const utteranceDocs = await db.collections.utterances.findByIndex('speakerId', id);
    const utterances = utteranceDocs.map((doc) => doc.toJSON());
    const segments = (await LayerSegmentQueryService.listAllSegments())
      .filter((segment) => segment.speakerId?.trim() === id);
    const affectedCount = utterances.length + segments.length;

    if (affectedCount > 0 && strategy === 'reject') {
      throw new Error(`说话人仍被 ${affectedCount} 条句段引用`);
    }

    const now = new Date().toISOString();

    if (affectedCount > 0 && strategy === 'merge') {
      const targetId = options.targetSpeakerId?.trim();
      if (!targetId) throw new Error('删除说话人时未指定迁移目标');
      if (targetId === id) throw new Error('迁移目标不能是当前说话人');
      const targetDoc = await db.collections.speakers.findOne({ selector: { id: targetId } }).exec();
      if (!targetDoc) throw new Error(`目标说话人不存在: ${targetId}`);
      const target = targetDoc.toJSON();

      const normalized = utterances.map((row) => normalizeUtteranceDocForStorage({
        ...row,
        speakerId: target.id,
        speaker: target.name,
        updatedAt: now,
      }));
      if (normalized.length > 0) {
        await db.collections.utterances.bulkInsert(normalized);
      }

      if (segments.length > 0) {
        const normalizedSegments = segments.map((segment) => ({
          ...segment,
          speakerId: target.id,
          updatedAt: now,
        }));
        await LegacyMirrorService.upsertSegments(db, normalizedSegments);
      }
    }

    if (affectedCount > 0 && strategy === 'clear') {
      const normalized = utterances.map((row) => {
        const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
        return normalizeUtteranceDocForStorage({
          ...rest,
          updatedAt: now,
        });
      });
      if (normalized.length > 0) {
        await db.collections.utterances.bulkInsert(normalized);
      }

      if (segments.length > 0) {
        const normalizedSegments = segments.map((segment) => {
          const { speakerId: _oldSpeakerId, ...rest } = segment;
          return {
            ...rest,
            updatedAt: now,
          };
        });
        await LegacyMirrorService.upsertSegments(db, normalizedSegments);
      }
    }

    await db.collections.speakers.remove(id);
    return affectedCount;
  }

  static async assignSpeakerToUtterances(
    utteranceIds: Iterable<string>,
    speakerId?: string,
  ): Promise<number> {
    const db = await getDb();
    const ids = [...new Set(Array.from(utteranceIds).map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return 0;

    const selectedSpeakerId = speakerId?.trim();
    let speaker: SpeakerDocType | undefined;
    if (selectedSpeakerId) {
      const speakerDoc = await db.collections.speakers.findOne({ selector: { id: selectedSpeakerId } }).exec();
      if (!speakerDoc) {
        throw new Error(`说话人不存在: ${selectedSpeakerId}`);
      }
      speaker = speakerDoc.toJSON();
    }

    const docs = await Promise.all(ids.map((id) => db.collections.utterances.findOne({ selector: { id } }).exec()));
    const rows = docs.filter((doc): doc is NonNullable<typeof doc> => Boolean(doc)).map((doc) => doc.toJSON());
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    const updates = rows.map((row) => {
      const { speaker: _oldSpeaker, speakerId: _oldSpeakerId, ...rest } = row;
      return normalizeUtteranceDocForStorage({
        ...rest,
        ...(speaker ? { speaker: speaker.name, speakerId: speaker.id } : {}),
        updatedAt: now,
      });
    });

    await db.collections.utterances.bulkInsert(updates);
    await bulkUpsertUtteranceLayerUnits(db, updates);
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
        throw new Error(`说话人不存在: ${selectedSpeakerId}`);
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

    await LegacyMirrorService.upsertSegments(db, updates);
    return updates.length;
  }

  static async saveUtterance(data: UtteranceDocType): Promise<string> {
    const db = await getDb();
    const normalized = normalizeUtteranceDocForStorage(data);
    const existing = await db.collections.utterances.findOne({ selector: { id: normalized.id } }).exec();
    const doc = await db.collections.utterances.insert(normalized);
    await enforceTimeSubdivisionParentBounds(
      db,
      normalized.id,
      normalized.startTime,
      normalized.endTime,
    );
    await upsertUtteranceLayerUnit(db, normalized);
    if (existing && hasEmbeddedDefaultTextChanged(existing.toJSON(), normalized)) {
      await invalidateUtteranceEmbeddings(db, [normalized.id]);
    }
    return doc.primary;
  }

  static async getUtterancesByTextId(textId: string): Promise<UtteranceDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterances.findByIndex('textId', textId);
    return docs.map((doc) => doc.toJSON());
  }

  static async saveUtterancesBatch(items: UtteranceDocType[]): Promise<void> {
    const db = await getDb();
    const normalized = items.map(normalizeUtteranceDocForStorage);
    const existingRows = await db.dexie.utterances.bulkGet(normalized.map((item) => item.id));
    const changedUtteranceIds = normalized
      .filter((item, index) => hasEmbeddedDefaultTextChanged(existingRows[index], item))
      .map((item) => item.id);
    await db.collections.utterances.bulkInsert(normalized);
    for (const row of normalized) {
      await enforceTimeSubdivisionParentBounds(
        db,
        row.id,
        row.startTime,
        row.endTime,
      );
    }
    await bulkUpsertUtteranceLayerUnits(db, normalized);
    if (changedUtteranceIds.length > 0) {
      await invalidateUtteranceEmbeddings(db, changedUtteranceIds);
    }
  }

  static async getTokensByUtteranceId(utteranceId: string): Promise<UtteranceTokenDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterance_tokens.findByIndex('utteranceId', utteranceId);
    return docs.map((doc) => doc.toJSON()).sort((a, b) => a.tokenIndex - b.tokenIndex);
  }

  static async getMorphemesByTokenId(tokenId: string): Promise<UtteranceMorphemeDocType[]> {
    const db = await getDb();
    const docs = await db.collections.utterance_morphemes.findByIndex('tokenId', tokenId);
    return docs.map((doc) => doc.toJSON()).sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  static async saveToken(data: UtteranceTokenDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterance_tokens.insert(data);
    return doc.primary;
  }

  static async saveTokensBatch(items: UtteranceTokenDocType[]): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_tokens.bulkInsert(items);
  }

  static async updateTokenPos(tokenId: string, pos: string | null): Promise<void> {
    const db = await getDb();
    const existing = await db.collections.utterance_tokens
      .findOne({ selector: { id: tokenId } }).exec();
    if (!existing) {
      throw new Error(`未找到 token: ${tokenId}`);
    }

    const row = existing.toJSON();
    const trimmed = (pos ?? '').trim();
    const nextPos = trimmed.length > 0 ? trimmed : undefined;
    const { pos: _oldPos, ...rest } = row;

    await db.collections.utterance_tokens.insert({
      ...rest,
      ...(nextPos ? { pos: nextPos } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  static async updateTokenGloss(tokenId: string, gloss: string | null, lang = 'eng'): Promise<void> {
    const db = await getDb();
    const existing = await db.collections.utterance_tokens
      .findOne({ selector: { id: tokenId } }).exec();
    if (!existing) {
      throw new Error(`未找到 token: ${tokenId}`);
    }

    const row = existing.toJSON();
    const trimmed = (gloss ?? '').trim();

    let nextGloss: Record<string, string> | undefined;
    if (trimmed.length > 0) {
      nextGloss = { ...(row.gloss ?? {}), [lang]: trimmed };
    } else if (row.gloss) {
      // 清除指定语言的 gloss；若无其他语言则整体清除
      // Remove gloss for this lang; clear entirely if no other langs remain
      const { [lang]: _removed, ...rest } = row.gloss;
      nextGloss = Object.keys(rest).length > 0 ? rest : undefined;
    }

    const { gloss: _oldGloss, ...rest } = row;
    await db.collections.utterance_tokens.insert({
      ...rest,
      ...(nextGloss ? { gloss: nextGloss } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  static async batchUpdateTokenPosByForm(
    utteranceId: string,
    form: string,
    pos: string | null,
    orthographyKey = 'default',
  ): Promise<number> {
    const db = await getDb();
    const normalizedForm = form.trim();
    if (!normalizedForm) return 0;

    const tokens = await db.collections.utterance_tokens.findByIndex('utteranceId', utteranceId);
    const rows = tokens.map((doc) => doc.toJSON());
    const normalizedPos = (pos ?? '').trim();
    const now = new Date().toISOString();

    const matches = rows.filter((row) => {
      const direct = row.form[orthographyKey];
      if (direct === normalizedForm) return true;
      return Object.values(row.form).some((v) => v === normalizedForm);
    });

    if (matches.length === 0) return 0;

    await db.collections.utterance_tokens.bulkInsert(matches.map((row) => {
      const { pos: _oldPos, ...rest } = row;
      return {
        ...rest,
        ...(normalizedPos ? { pos: normalizedPos } : {}),
        updatedAt: now,
      };
    }));

    return matches.length;
  }

  static async saveMorpheme(data: UtteranceMorphemeDocType): Promise<string> {
    const db = await getDb();
    const doc = await db.collections.utterance_morphemes.insert(data);
    return doc.primary;
  }

  static async saveMorphemesBatch(items: UtteranceMorphemeDocType[]): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_morphemes.bulkInsert(items);
  }

  static async removeToken(tokenId: string): Promise<void> {
    const db = await getDb();
    await db.collections.utterance_morphemes.removeBySelector({ tokenId });
    await db.collections.utterance_tokens.remove(tokenId);
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

  static async getUtteranceTexts(utteranceId: string): Promise<UtteranceTextDocType[]> {
    const db = await getDb();
    return listUtteranceTextsByUtterance(db, utteranceId);
  }

  static async saveUtteranceText(data: UtteranceTextDocType): Promise<string> {
    const db = await getDb();
    // 写入 V2 segment 表 | Write to V2 segment tables
    const utterance = await db.collections.utterances.findOne({ selector: { id: data.utteranceId } }).exec();
    if (utterance) {
      await syncUtteranceTextToSegmentationV2(db, utterance.toJSON() as UtteranceDocType, data);
    }
    if (await isDefaultTranscriptionLayerForUtteranceText(db, data.utteranceId, data.layerId)) {
      await invalidateUtteranceEmbeddings(db, [data.utteranceId]);
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

  // ── Tier definition CRUD ───────────────────────────────────

  static async getTierDefinitions(textId: string): Promise<TierDefinitionDocType[]> {
    const db = await getDb();
    const docs = await db.collections.tier_definitions.findByIndex('textId', textId);
    return docs.map((doc) => doc.toJSON());
  }

  /** Internal: persist tier definition + audit, no constraint validation. */
  private static async _persistTierDefinition(data: TierDefinitionDocType, source: AuditSource): Promise<string> {
    const db = await getDb();
    const existing = await db.collections.tier_definitions.findOne({ selector: { id: data.id } }).exec();
    const doc = await db.collections.tier_definitions.insert(data);
    if (existing) {
      const changes = diffTrackedFields('tier_definitions', existing.toJSON() as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      if (changes.length > 0) {
        await writeAuditLog('tier_definitions', data.id, 'update', source, changes);
      }
    } else {
      await writeAuditLog('tier_definitions', data.id, 'create', source);
    }
    return doc.primary;
  }

  /**
   * Save tier definition with structural constraint validation (R1, S5, S6).
   * Errors block the save; warnings are returned but the save proceeds.
   */
  static async saveTierDefinition(data: TierDefinitionDocType, source: AuditSource = 'human'): Promise<TierSaveResult> {
    const db = await getDb();

    // Load all tier definitions for the same text
    const allDocs = await db.collections.tier_definitions.findByIndex('textId', data.textId);
    const allTiers = allDocs.map((d) => d.toJSON());

    // Simulate adding/updating this tier
    const merged = allTiers.filter((t) => t.id !== data.id);
    merged.push(data);

    // Validate structural rules (no annotations needed for R1, S5, S6)
    const violations = validateTierConstraints(merged, []);
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { id: '', errors, warnings: [] };
    }

    const id = await this._persistTierDefinition(data, source);
    const warnings = violations.filter((v) => v.severity === 'warning');
    return { id, errors: [], warnings };
  }

  /**
   * Remove tier definition with cascade: deletes all annotations on this tier,
   * and rejects if child tiers still reference it.
   */
  static async removeTierDefinition(id: string, source: AuditSource = 'human'): Promise<{ errors: ConstraintViolation[] }> {
    const db = await getDb();

    // Check for child tiers that reference this tier as parent
    const allDocs = await db.collections.tier_definitions.findByIndex('parentTierId', id);
    const childTiers = allDocs.map((d) => d.toJSON());
    if (childTiers.length > 0) {
      return {
        errors: childTiers.map((ct) => ({
          rule: 'CASCADE',
          severity: 'error' as ConstraintSeverity,
          tierId: id,
          message: `Cannot delete: child tier "${ct.key}" (${ct.id}) still references this tier as parent.`,
        })),
      };
    }

    // Cascade: delete all annotations belonging to this tier (including owned anchors)
    const annDocs = await db.collections.tier_annotations.findByIndex('tierId', id);
    const tierAnns = annDocs.map((d) => d.toJSON());
    for (const ann of tierAnns) {
      if (ann.startAnchorId) await db.collections.anchors.remove(ann.startAnchorId);
      if (ann.endAnchorId) await db.collections.anchors.remove(ann.endAnchorId);
      await db.collections.tier_annotations.remove(ann.id);
      await writeAuditLog('tier_annotations', ann.id, 'delete', source);
    }

    await db.collections.tier_definitions.remove(id);
    await writeAuditLog('tier_definitions', id, 'delete', source);
    return { errors: [] };
  }

  // ── Tier annotation CRUD ───────────────────────────────────

  static async getTierAnnotations(tierId: string): Promise<TierAnnotationDocType[]> {
    const db = await getDb();
    const docs = await db.collections.tier_annotations.findByIndex('tierId', tierId);
    return docs.map((doc) => doc.toJSON());
  }

  /** Internal: load tier definitions + annotations for a given textId. */
  private static async _loadTierGraph(textId: string) {
    const db = await getDb();
    const tierDocs = await db.collections.tier_definitions.findByIndex('textId', textId);
    const tiers = tierDocs.map((d) => d.toJSON());
    const tierIds = tiers.map((t) => t.id);
    const annDocs = await db.collections.tier_annotations.findByIndexAnyOf('tierId', tierIds);
    const annotations = annDocs.map((d) => d.toJSON());
    return { tiers, annotations };
  }

  /** Internal: persist tier annotation + anchors + audit, no constraint validation. */
  private static async _persistTierAnnotation(data: TierAnnotationDocType, source: AuditSource, mediaId?: string): Promise<string> {
    const db = await getDb();
    data = normalizeTierAnnotationDocForStorage(data, {
      actorType: source === 'ai' ? 'ai' : source === 'system' ? 'system' : 'human',
      method: source === 'ai' ? 'auto-gloss' : source === 'system' ? 'migration' : 'manual',
    });

    // Enforce CAM write contract: stable IDs and confirmed-review lock for AI writes.
    assertStableId(data.id, 'tier annotation');
    assertReviewProtection(data.provenance?.reviewStatus, source);

    // Create anchors for time-bearing annotations (dual-write: keep startTime/endTime as cache)
    if (mediaId && data.startTime !== undefined && data.endTime !== undefined) {
      const now = new Date().toISOString();
      const startTime = data.startTime;
      const endTime = data.endTime;
      if (!data.startAnchorId) {
        const startAnchor: AnchorDocType = { id: newId('anc'), mediaId, time: startTime, createdAt: now };
        await db.collections.anchors.insert(startAnchor);
        data = { ...data, startAnchorId: startAnchor.id };
      }
      if (!data.endAnchorId) {
        const endAnchor: AnchorDocType = { id: newId('anc'), mediaId, time: endTime, createdAt: now };
        await db.collections.anchors.insert(endAnchor);
        data = { ...data, endAnchorId: endAnchor.id };
      }
    }

    const existing = await db.collections.tier_annotations.findOne({ selector: { id: data.id } }).exec();
    const doc = await db.collections.tier_annotations.insert(data);
    if (existing) {
      const changes = diffTrackedFields('tier_annotations', existing.toJSON() as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      if (changes.length > 0) {
        await writeAuditLog('tier_annotations', data.id, 'update', source, changes);
      }
    } else {
      await writeAuditLog('tier_annotations', data.id, 'create', source);
    }
    return doc.primary;
  }

  /**
   * Save tier annotation with full constraint validation.
   * Loads the tier graph context, simulates adding this annotation,
   * then runs all 14 constraint rules. Errors block the save.
   */
  static async saveTierAnnotation(data: TierAnnotationDocType, source: AuditSource = 'human'): Promise<TierSaveResult> {
    const db = await getDb();

    // Look up the tier to get textId for loading the full context
    const tierDoc = await db.collections.tier_definitions.findOne({ selector: { id: data.tierId } }).exec();
    if (!tierDoc) {
      return {
        id: '',
        errors: [{ rule: 'R2', severity: 'error', tierId: data.tierId, annotationId: data.id, message: `Annotation references non-existent tier "${data.tierId}".` }],
        warnings: [],
      };
    }
    const textId = tierDoc.toJSON().textId;

    // Resolve mediaId for anchor creation
    const mediaItems = await db.collections.media_items.findByIndex('textId', textId);
    const mediaId = mediaItems[0]?.toJSON().id;

    // Load full tier graph + annotations
    const { tiers, annotations: existingAnns } = await this._loadTierGraph(textId);

    // Merge: this annotation overrides any existing one with same id
    const merged = new Map(existingAnns.map((a) => [a.id, a]));
    merged.set(data.id, data);

    // Validate full constraint set
    const violations = validateTierConstraints(tiers, [...merged.values()]);
    const errors = violations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { id: '', errors, warnings: [] };
    }

    const id = await this._persistTierAnnotation(data, source, mediaId);
    const warnings = violations.filter((v) => v.severity === 'warning');
    return { id, errors: [], warnings };
  }

  /**
   * Remove tier annotation with cascade: deletes all child annotations
   * that reference this annotation as parentAnnotationId.
   * Also removes owned anchors (independent anchor model).
   */
  static async removeTierAnnotation(id: string, source: AuditSource = 'human'): Promise<void> {
    const db = await getDb();

    // Cascade: delete child annotations referencing this one
    const childDocs = await db.collections.tier_annotations.findByIndex('parentAnnotationId', id);
    const children = childDocs.map((d) => d.toJSON());
    for (const child of children) {
      await this.removeTierAnnotation(child.id, source);
    }

    // Delete owned anchors
    const annDoc = await db.collections.tier_annotations.findOne({ selector: { id } }).exec();
    if (annDoc) {
      const ann = annDoc.toJSON();
      if (ann.startAnchorId) await db.collections.anchors.remove(ann.startAnchorId);
      if (ann.endAnchorId) await db.collections.anchors.remove(ann.endAnchorId);
    }

    await db.collections.tier_annotations.remove(id);
    await writeAuditLog('tier_annotations', id, 'delete', source);
  }

  // ── Batch save with constraint validation ──────────────────

  static async saveTierAnnotationsBatch(
    textId: string,
    newAnnotations: readonly TierAnnotationDocType[],
  ): Promise<{ violations: ConstraintViolation[]; warnings: ConstraintViolation[] }> {

    // Load current tier graph
    const { tiers, annotations: existingAnns } = await this._loadTierGraph(textId);

    // Resolve mediaId for anchor creation
    const db = await getDb();
    const mediaItems = await db.collections.media_items.findByIndex('textId', textId);
    const mediaId = mediaItems[0]?.toJSON().id;

    // Merge: new annotations override existing ones with same id
    const merged = new Map(existingAnns.map((a) => [a.id, a]));
    for (const ann of newAnnotations) {
      merged.set(ann.id, ann);
    }

    // Validate
    const allViolations = validateTierConstraints(tiers, [...merged.values()]);
    const errors = allViolations.filter((v) => v.severity === 'error');
    if (errors.length > 0) {
      return { violations: errors, warnings: [] };
    }

    // Persist + audit (using internal method to skip per-item re-validation)
    for (const ann of newAnnotations) {
      await this._persistTierAnnotation(ann, 'human', mediaId);
    }

    const warnings = allViolations.filter((v) => v.severity === 'warning');
    return { violations: [], warnings };
  }

  // ── Audit log queries ──────────────────────────────────────

  static async getAuditLogs(documentId: string): Promise<AuditLogDocType[]> {
    const db = await getDb();
    const docs = await db.collections.audit_logs.findByIndex('documentId', documentId);
    return docs
      .map((d) => d.toJSON())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  static async getAuditLogsByCollection(collection: string): Promise<AuditLogDocType[]> {
    const db = await getDb();
    const docs = await db.collections.audit_logs.findByIndex('collection', collection);
    return docs
      .map((d) => d.toJSON())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ── Project initialization ─────────────────────────────────

  static async createProject(input: {
    titleZh: string;
    titleEn: string;
    primaryLanguageId: string;
    primaryOrthographyId?: string;
  }): Promise<{ textId: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const textId = newId('text');

    await db.collections.texts.insert({
      id: textId,
      title: { zho: input.titleZh, eng: input.titleEn },
      metadata: {
        primaryLanguageId: input.primaryLanguageId,
        ...(input.primaryOrthographyId ? { primaryOrthographyId: input.primaryOrthographyId } : {}),
      },
      createdAt: now,
      updatedAt: now,
    } as TextDocType);

    return { textId };
  }

  static async createOrthography(input: {
    languageId: string;
    name: MultiLangString;
    abbreviation?: string;
    type?: OrthographyDocType['type'];
    scriptTag?: string;
    localeTag?: string;
    regionTag?: string;
    variantTag?: string;
    direction?: OrthographyDocType['direction'];
    exemplarCharacters?: OrthographyDocType['exemplarCharacters'];
    normalization?: OrthographyDocType['normalization'];
    collation?: OrthographyDocType['collation'];
    fontPreferences?: OrthographyDocType['fontPreferences'];
    inputHints?: OrthographyDocType['inputHints'];
    bidiPolicy?: OrthographyDocType['bidiPolicy'];
    conversionRules?: Record<string, unknown>;
    notes?: MultiLangString;
  }): Promise<OrthographyDocType> {
    const db = await getDb();
    const now = new Date().toISOString();
    const orthography: OrthographyDocType = {
      id: newId('orth'),
      name: input.name,
      languageId: input.languageId,
      ...(input.abbreviation ? { abbreviation: input.abbreviation } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.scriptTag ? { scriptTag: input.scriptTag } : {}),
      ...(input.localeTag ? { localeTag: input.localeTag } : {}),
      ...(input.regionTag ? { regionTag: input.regionTag } : {}),
      ...(input.variantTag ? { variantTag: input.variantTag } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.exemplarCharacters ? { exemplarCharacters: input.exemplarCharacters } : {}),
      ...(input.normalization ? { normalization: input.normalization } : {}),
      ...(input.collation ? { collation: input.collation } : {}),
      ...(input.fontPreferences ? { fontPreferences: input.fontPreferences } : {}),
      ...(input.inputHints ? { inputHints: input.inputHints } : {}),
      ...(input.bidiPolicy ? { bidiPolicy: input.bidiPolicy } : {}),
      ...(input.conversionRules ? { conversionRules: input.conversionRules } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.collections.orthographies.insert(orthography);
    return orthography;
  }

  static async cloneOrthographyToLanguage(input: {
    sourceOrthographyId: string;
    targetLanguageId: string;
    name?: MultiLangString;
    abbreviation?: string;
    type?: OrthographyDocType['type'];
    scriptTag?: string;
    localeTag?: string;
    regionTag?: string;
    variantTag?: string;
    direction?: OrthographyDocType['direction'];
    exemplarCharacters?: OrthographyDocType['exemplarCharacters'];
    normalization?: OrthographyDocType['normalization'];
    collation?: OrthographyDocType['collation'];
    fontPreferences?: OrthographyDocType['fontPreferences'];
    inputHints?: OrthographyDocType['inputHints'];
    bidiPolicy?: OrthographyDocType['bidiPolicy'];
    conversionRules?: Record<string, unknown>;
    notes?: MultiLangString;
  }): Promise<OrthographyDocType> {
    const db = await getDb();
    const sourceDoc = await db.collections.orthographies.findOne({
      selector: { id: input.sourceOrthographyId },
    }).exec();
    const source = sourceDoc?.toJSON();
    if (!source) {
      throw new Error('源正字法不存在');
    }

    return LinguisticService.createOrthography({
      languageId: input.targetLanguageId,
      name: input.name ?? source.name,
      ...((input.abbreviation ?? source.abbreviation) !== undefined
        ? { abbreviation: input.abbreviation ?? source.abbreviation }
        : {}),
      ...((input.type ?? source.type) !== undefined ? { type: input.type ?? source.type } : {}),
      ...((input.scriptTag ?? source.scriptTag) !== undefined
        ? { scriptTag: input.scriptTag ?? source.scriptTag }
        : {}),
      ...((input.localeTag ?? source.localeTag) !== undefined
        ? { localeTag: input.localeTag ?? source.localeTag }
        : {}),
      ...((input.regionTag ?? source.regionTag) !== undefined
        ? { regionTag: input.regionTag ?? source.regionTag }
        : {}),
      ...((input.variantTag ?? source.variantTag) !== undefined
        ? { variantTag: input.variantTag ?? source.variantTag }
        : {}),
      ...((input.direction ?? source.direction) !== undefined
        ? { direction: input.direction ?? source.direction }
        : {}),
      ...((input.exemplarCharacters ?? source.exemplarCharacters) !== undefined
        ? { exemplarCharacters: input.exemplarCharacters ?? source.exemplarCharacters }
        : {}),
      ...((input.normalization ?? source.normalization) !== undefined
        ? { normalization: input.normalization ?? source.normalization }
        : {}),
      ...((input.collation ?? source.collation) !== undefined
        ? { collation: input.collation ?? source.collation }
        : {}),
      ...((input.fontPreferences ?? source.fontPreferences) !== undefined
        ? { fontPreferences: input.fontPreferences ?? source.fontPreferences }
        : {}),
      ...((input.inputHints ?? source.inputHints) !== undefined
        ? { inputHints: input.inputHints ?? source.inputHints }
        : {}),
      ...((input.bidiPolicy ?? source.bidiPolicy) !== undefined
        ? { bidiPolicy: input.bidiPolicy ?? source.bidiPolicy }
        : {}),
      ...((input.conversionRules ?? source.conversionRules) !== undefined
        ? { conversionRules: input.conversionRules ?? source.conversionRules }
        : {}),
      ...((input.notes ?? source.notes) !== undefined ? { notes: input.notes ?? source.notes } : {}),
    });
  }

  static async createOrthographyTransform(input: {
    sourceOrthographyId: string;
    targetOrthographyId: string;
    engine: OrthographyTransformDocType['engine'];
    rules: OrthographyTransformDocType['rules'];
    name?: MultiLangString;
    sampleInput?: string;
    sampleOutput?: string;
    sampleCases?: OrthographyTransformDocType['sampleCases'];
    isReversible?: boolean;
    status?: OrthographyTransformDocType['status'];
    notes?: MultiLangString;
  }): Promise<OrthographyTransformDocType> {
    const db = await getDb();
    const now = new Date().toISOString();
    const transform: OrthographyTransformDocType = {
      id: newId('orthxfm'),
      sourceOrthographyId: input.sourceOrthographyId,
      targetOrthographyId: input.targetOrthographyId,
      engine: input.engine,
      rules: input.rules,
      ...(input.name ? { name: input.name } : {}),
      ...(input.sampleInput ? { sampleInput: input.sampleInput } : {}),
      ...(input.sampleOutput ? { sampleOutput: input.sampleOutput } : {}),
      ...(input.sampleCases ? { sampleCases: input.sampleCases } : {}),
      ...(input.isReversible !== undefined ? { isReversible: input.isReversible } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.collections.orthography_transforms.insert(transform);
    return transform;
  }

  static async listOrthographyTransforms(selector: {
    sourceOrthographyId?: string;
    targetOrthographyId?: string;
  } = {}): Promise<OrthographyTransformDocType[]> {
    const db = await getDb();
    const docs = await db.collections.orthography_transforms.find().exec();
    const rankStatus = (status: OrthographyTransformDocType['status']): number => {
      if (status === 'active') return 0;
      if (status === 'draft' || status === undefined) return 1;
      return 2;
    };
    return docs
      .map((doc) => doc.toJSON())
      .filter((doc) => {
        if (selector.sourceOrthographyId && doc.sourceOrthographyId !== selector.sourceOrthographyId) {
          return false;
        }
        if (selector.targetOrthographyId && doc.targetOrthographyId !== selector.targetOrthographyId) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const rankDiff = rankStatus(left.status) - rankStatus(right.status);
        if (rankDiff !== 0) return rankDiff;
        return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
      });
  }

  static async updateOrthographyTransform(input: {
    id: string;
    sourceOrthographyId?: string;
    targetOrthographyId?: string;
    name?: MultiLangString | null;
    engine?: OrthographyTransformDocType['engine'];
    rules?: OrthographyTransformDocType['rules'];
    sampleInput?: string | null;
    sampleOutput?: string | null;
    sampleCases?: OrthographyTransformDocType['sampleCases'] | null;
    isReversible?: boolean | null;
    status?: OrthographyTransformDocType['status'] | null;
    notes?: MultiLangString | null;
  }): Promise<OrthographyTransformDocType> {
    const db = await getDb();
    const existing = await db.dexie.orthography_transforms.get(input.id);
    if (!existing) {
      throw new Error('正字法变换不存在');
    }

    const next: OrthographyTransformDocType = {
      ...existing,
      ...(input.sourceOrthographyId ? { sourceOrthographyId: input.sourceOrthographyId } : {}),
      ...(input.targetOrthographyId ? { targetOrthographyId: input.targetOrthographyId } : {}),
      ...(input.engine ? { engine: input.engine } : {}),
      ...(input.rules ? { rules: input.rules } : {}),
      updatedAt: new Date().toISOString(),
    };

    if (input.name === null) {
      delete next.name;
    } else if (input.name !== undefined) {
      next.name = input.name;
    }

    if (input.sampleInput === null) {
      delete next.sampleInput;
    } else if (input.sampleInput !== undefined) {
      next.sampleInput = input.sampleInput;
    }

    if (input.sampleOutput === null) {
      delete next.sampleOutput;
    } else if (input.sampleOutput !== undefined) {
      next.sampleOutput = input.sampleOutput;
    }

    if (input.sampleCases === null) {
      delete next.sampleCases;
    } else if (input.sampleCases !== undefined) {
      next.sampleCases = input.sampleCases;
    }

    if (input.isReversible === null) {
      delete next.isReversible;
    } else if (input.isReversible !== undefined) {
      next.isReversible = input.isReversible;
    }

    if (input.status === null) {
      delete next.status;
    } else if (input.status !== undefined) {
      next.status = input.status;
    }

    if (input.notes === null) {
      delete next.notes;
    } else if (input.notes !== undefined) {
      next.notes = input.notes;
    }

    await db.collections.orthography_transforms.insert(next);
    return next;
  }

  static async deleteOrthographyTransform(id: string): Promise<void> {
    const db = await getDb();
    await db.collections.orthography_transforms.remove(id);
  }

  static async getActiveOrthographyTransform(input: {
    sourceOrthographyId: string;
    targetOrthographyId: string;
  }): Promise<OrthographyTransformDocType | null> {
    const db = await getDb();
    const candidates = await db.dexie.orthography_transforms
      .where('[sourceOrthographyId+targetOrthographyId]')
      .equals([input.sourceOrthographyId, input.targetOrthographyId])
      .toArray();

    const rankStatus = (status: OrthographyTransformDocType['status']): number => {
      if (status === 'active') return 0;
      if (status === 'draft' || status === undefined) return 1;
      return 2;
    };

    const preferred = candidates
      .filter((doc) => doc.status !== 'deprecated')
      .sort((left, right) => {
        const rankDiff = rankStatus(left.status) - rankStatus(right.status);
        if (rankDiff !== 0) return rankDiff;
        return (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
      })[0];

    return preferred ?? null;
  }

  static async applyOrthographyTransform(input: {
    sourceOrthographyId: string;
    targetOrthographyId: string;
    text: string;
  }): Promise<{ text: string; transformId?: string }> {
    if (!input.text || input.sourceOrthographyId === input.targetOrthographyId) {
      return { text: input.text };
    }

    const transform = await LinguisticService.getActiveOrthographyTransform({
      sourceOrthographyId: input.sourceOrthographyId,
      targetOrthographyId: input.targetOrthographyId,
    });
    if (!transform) {
      return { text: input.text };
    }

    return {
      text: previewOrthographyTransform({
        engine: transform.engine,
        rules: transform.rules,
        text: input.text,
      }),
      transformId: transform.id,
    };
  }

  static previewOrthographyTransform(input: {
    engine: OrthographyTransformDocType['engine'];
    rules: OrthographyTransformDocType['rules'];
    text: string;
  }): string {
    return previewOrthographyTransform(input);
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
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.tier_annotations,
        db.dexie.tier_definitions,
        db.dexie.utterances,
        db.dexie.media_items,
        db.dexie.anchors,
        db.dexie.texts,
      ],
      async () => {
        // Collect utterance IDs so we can cascade to translations
        const allUtts = await db.dexie.utterances.where('textId').equals(textId).toArray();
        const uttIds = allUtts.map((u) => u.id);

        await this.removeNotesForUtteranceIds(db, uttIds);
        await invalidateUtteranceEmbeddings(db, uttIds);

        // Cascade: V2 segments + canonical token entities
        for (const uttId of uttIds) {
          const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(uttId).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(uttId).toArray()).map((m) => m.id);
          await removeUtteranceCascadeFromSegmentationV2(db, uttId);
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.utterance_tokens.where('utteranceId').equals(uttId).delete();
          await db.dexie.utterance_morphemes.where('utteranceId').equals(uttId).delete();
        }

        await deleteResidualLayerUnitGraphByTextId(db, textId);

        // Cascade: tier_annotations belonging to tier_definitions of this text
        const tierDefs = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
        for (const td of tierDefs) {
          await db.dexie.tier_annotations.where('tierId').equals(td.id).delete();
        }

        await db.dexie.tier_definitions.where('textId').equals(textId).delete();
        await db.dexie.utterances.where('textId').equals(textId).delete();

        // Cascade: anchors belonging to media of this text
        const mediaItems = await db.dexie.media_items.where('textId').equals(textId).toArray();
        for (const m of mediaItems) {
          await db.dexie.anchors.where('mediaId').equals(m.id).delete();
        }

        await db.dexie.media_items.where('textId').equals(textId).delete();
        await db.dexie.texts.delete(textId);
      },
    );
  }

  /** Delete a media item and its associated utterances + translations + anchors (cascade). */
  static async deleteAudio(mediaId: string): Promise<void> {
    const db = await getDb();

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.utterances,
        db.dexie.anchors,
        db.dexie.media_items,
      ],
      async () => {
        // Find utterances linked to this media
        const utts = (await db.dexie.utterances.toArray()).filter((u) => u.mediaId === mediaId);
        const uttIds = utts.map((u) => u.id);

        await this.removeNotesForUtteranceIds(db, uttIds);
        await invalidateUtteranceEmbeddings(db, uttIds);

        // Cascade: V2 segments + canonical token entities
        for (const u of utts) {
          const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(u.id).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(u.id).toArray()).map((m) => m.id);
          await removeUtteranceCascadeFromSegmentationV2(db, u.id);
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.utterance_tokens.where('utteranceId').equals(u.id).delete();
          await db.dexie.utterance_morphemes.where('utteranceId').equals(u.id).delete();
        }

        await deleteResidualLayerUnitGraphByMediaId(db, mediaId);

        if (uttIds.length > 0) {
          await db.dexie.utterances.bulkDelete(uttIds);
        }
        await db.dexie.anchors.where('mediaId').equals(mediaId).delete();
        await db.dexie.media_items.delete(mediaId);
      },
    );
  }

  /** Delete a single utterance and cascade-delete its translations + lexicon links + anchors. */
  static async removeUtterance(utteranceId: string): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.utterances,
        db.dexie.anchors,
      ],
      async () => {
        await this.removeNotesForUtteranceIds(db, [utteranceId]);
        await invalidateUtteranceEmbeddings(db, [utteranceId]);

        // Read utterance to get anchor IDs before deleting
        const utt = await db.dexie.utterances.get(utteranceId);
        const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).toArray();
        const tokenIds = tokens.map((t) => t.id);
        const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).toArray()).map((m) => m.id);

        await removeUtteranceCascadeFromSegmentationV2(db, utteranceId);
        if (tokenIds.length > 0 || morphemeIds.length > 0) {
          const targets: Array<[string, string]> = [
            ...tokenIds.map((id) => ['token', id] as [string, string]),
            ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
          ];
          await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
        }
        await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).delete();
        await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).delete();
        await deleteUtteranceLayerUnitCascade(db, [utteranceId]);
        await db.dexie.utterances.delete(utteranceId);

        // Cleanup owned anchors
        if (utt?.startAnchorId) await db.dexie.anchors.delete(utt.startAnchorId);
        if (utt?.endAnchorId) await db.dexie.anchors.delete(utt.endAnchorId);
      },
    );
  }

  /**
   * Delete multiple utterances in one transaction with the same cascade semantics
    * as removeUtterance (V2 segments, token_lexeme_links, anchors).
   */
  static async removeUtterancesBatch(utteranceIds: readonly string[]): Promise<void> {
    const ids = [...new Set(utteranceIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;

    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.embeddings,
        db.dexie.layer_unit_contents,
        db.dexie.layer_units,
        db.dexie.unit_relations,
        db.dexie.utterance_tokens,
        db.dexie.utterance_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.user_notes,
        db.dexie.utterances,
        db.dexie.anchors,
      ],
      async () => {
        const utts = (await db.dexie.utterances.bulkGet(ids)).filter((u): u is NonNullable<typeof u> => Boolean(u));

        await this.removeNotesForUtteranceIds(db, ids);
        await invalidateUtteranceEmbeddings(db, ids);

        for (const utteranceId of ids) {
          const tokens = await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).toArray();
          const tokenIds = tokens.map((t) => t.id);
          const morphemeIds = (await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).toArray()).map((m) => m.id);
          await removeUtteranceCascadeFromSegmentationV2(db, utteranceId);
          if (tokenIds.length > 0 || morphemeIds.length > 0) {
            const targets: Array<[string, string]> = [
              ...tokenIds.map((id) => ['token', id] as [string, string]),
              ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
            ];
            await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(targets).delete();
          }
          await db.dexie.utterance_tokens.where('utteranceId').equals(utteranceId).delete();
          await db.dexie.utterance_morphemes.where('utteranceId').equals(utteranceId).delete();
        }

        await deleteUtteranceLayerUnitCascade(db, ids);

        await db.dexie.utterances.bulkDelete(ids);

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
  }

  /** Prune audit logs older than the given number of days. */
  static async pruneAuditLogs(maxAgeDays: number = 90): Promise<number> {
    const db = await getDb();
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const old = await db.dexie.audit_logs.where('timestamp').below(cutoff).primaryKeys();
    await db.dexie.audit_logs.bulkDelete(old);
    return old.length;
  }
}
