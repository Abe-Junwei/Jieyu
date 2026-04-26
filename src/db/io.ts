/**
 * 数据库导入导出 | Database import/export
 *
 * JSON 格式快照的导出与导入，支持冲突策略与数据校验。
 * 导出不包含离线 `audioBlob`（仅结构化 + `details` 中 `audioExportOmitted` 标记）；导入仍接受 `audioDataUrl` 以灌回 Blob。
 */
import { z } from 'zod';
import type { Table } from 'dexie';
import type { TextDocType, MediaItemDocType, UnitTokenDocType, UnitMorphemeDocType, AnchorDocType, LexemeDocType, TokenLexemeLinkDocType, AiTaskDoc, EmbeddingDoc, AiConversationDoc, AiMessageDoc, LanguageDocType, LanguageDisplayNameDocType, LanguageAliasDocType, LanguageCatalogHistoryDocType, CustomFieldDefinitionDocType, SpeakerDocType, OrthographyDocType, OrthographyBridgeDocType, LocationDocType, BibliographicSourceDocType, GrammarDocDocType, AbbreviationDocType, StructuralRuleProfileAssetDocType, PhonemeDocType, TagDefinitionDocType, LayerDocType, LayerUnitDocType, LayerUnitContentDocType, UnitRelationDocType, LayerLinkDocType, TierDefinitionDocType, TierAnnotationDocType, AuditLogDocType, UserNoteDocType, SegmentMetaDocType, SegmentQualitySnapshotDocType, ScopeStatsSnapshotDocType, SpeakerProfileSnapshotDocType, TranslationStatusSnapshotDocType, LanguageAssetOverviewDocType, AiTaskSnapshotDocType, TrackEntityDocType, ProvenanceEnvelope, JieyuCollections, ImportConflictStrategy, ImportResult } from './types';
import { isoDateSchema, validateTextDoc, validateMediaItemDoc, validateUnitTokenDoc, validateUnitMorphemeDoc, validateAnchorDoc, validateLexemeDoc, validateTokenLexemeLinkDoc, validateAiTaskDoc, validateEmbeddingDoc, validateAiConversationDoc, validateAiMessageDoc, validateLanguageDoc, validateLanguageDisplayNameDoc, validateLanguageAliasDoc, validateLanguageCatalogHistoryDoc, validateCustomFieldDefinitionDoc, validateSpeakerDoc, validateOrthographyDoc, validateOrthographyBridgeDoc, validateLocationDoc, validateBibliographicSourceDoc, validateGrammarDoc, validateAbbreviationDoc, validateStructuralRuleProfileAssetDoc, validatePhonemeDoc, validateTagDefinitionDoc, validateLayerDoc, validateLayerUnitDoc, validateLayerUnitContentDoc, validateUnitRelationDoc, validateLayerLinkDoc, validateTierDefinitionDoc, validateTierAnnotationDoc, validateAuditLogDoc, validateUserNoteDoc, validateSegmentMetaDoc, validateSegmentQualitySnapshotDoc, validateScopeStatsSnapshotDoc, validateSpeakerProfileSnapshotDoc, validateTranslationStatusSnapshotDoc, validateLanguageAssetOverviewDoc, validateAiTaskSnapshotDoc, validateTrackEntityDoc } from './schemas';
import { db, getDb } from './engine';

/** Import/export JSON snapshots must use this exact `schemaVersion` (no older/newer formats). */
const SNAPSHOT_SCHEMA_VERSION = 4;
const SNAPSHOT_IMPORT_MAX_JSON_BYTES = 32 * 1024 * 1024;
const SNAPSHOT_IMPORT_MAX_JSON_DEPTH = 64;
const SNAPSHOT_IMPORT_MAX_JSON_NODES = 500_000;

export async function exportDatabaseAsJson(): Promise<{
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  collections: Record<string, unknown[]>;
}> {
  // 使用 rxDb 避免遮蔽模块级 Dexie db | Use rxDb to avoid shadowing module-level Dexie db
  const rxDb = await getDb();
  const entries = await Promise.all(
    Object.entries(rxDb.collections).map(async ([name, collection]) => {
      const docs = await collection.find().exec();
      return [name, docs.map((doc) => doc.toJSON())] as const;
    }),
  );

  const collections = Object.fromEntries(entries) as Record<string, unknown[]>;

  // Omit offline audio blobs from JSON (keeps exports bounded); re-attach audio via app or `audioDataUrl` on import.
  const mediaItems = collections['media_items'] as Array<Record<string, unknown>> | undefined;
  if (mediaItems) {
    for (const item of mediaItems) {
      const details = item['details'] as Record<string, unknown> | undefined;
      if (!details || !(details['audioBlob'] instanceof Blob)) continue;
      const copy = { ...details };
      delete copy['audioBlob'];
      copy['audioExportOmitted'] = true;
      item['details'] = copy;
    }
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dbName: rxDb.name,
    collections,
  };
}

import { markBackupCompleted } from '../hooks/useBackupReminder';

export async function downloadDatabaseAsJson(filename?: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadDatabaseAsJson can only run in browser context');
  }

  const snapshot = await exportDatabaseAsJson();
  const content = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `jieyu-export-${snapshot.exportedAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  // 重置备份提醒倒计时 | Reset backup reminder countdown
  markBackupCompleted();
}

const databaseSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDateSchema.optional(),
  dbName: z.string().optional(),
  collections: z.record(z.string(), z.array(z.unknown())),
});

const knownCollectionNames = [
  'texts',
  'media_items',
  'unit_tokens',
  'unit_morphemes',
  'anchors',
  'lexemes',
  'token_lexeme_links',
  'ai_tasks',
  'embeddings',
  'ai_conversations',
  'ai_messages',
  'languages',
  'language_display_names',
  'language_aliases',
  'language_catalog_history',
  'custom_field_definitions',
  'speakers',
  'orthographies',
  'orthography_bridges',
  'orthography_transforms',
  'locations',
  'bibliographic_sources',
  'grammar_docs',
  'abbreviations',
  'structural_rule_profiles',
  'phonemes',
  'tag_definitions',
  'layers',
  'layer_units',
  'layer_unit_contents',
  'unit_relations',
  'layer_links',
  'tier_definitions',
  'tier_annotations',
  'audit_logs',
  'user_notes',
  'segment_meta',
  'segment_quality_snapshots',
  'scope_stats_snapshots',
  'speaker_profile_snapshots',
  'translation_status_snapshots',
  'language_asset_overviews',
  'ai_task_snapshots',
  'track_entities',
] as const;

type KnownCollectionName = (typeof knownCollectionNames)[number];

const tableByCollection: Partial<Record<KnownCollectionName, Table<{ id: string }, string>>> = {
  texts: db.texts,
  media_items: db.media_items,
  unit_tokens: db.unit_tokens,
  unit_morphemes: db.unit_morphemes,
  anchors: db.anchors,
  lexemes: db.lexemes,
  token_lexeme_links: db.token_lexeme_links,
  ai_tasks: db.ai_tasks,
  embeddings: db.embeddings,
  ai_conversations: db.ai_conversations,
  ai_messages: db.ai_messages,
  languages: db.languages,
  language_display_names: db.language_display_names,
  language_aliases: db.language_aliases,
  language_catalog_history: db.language_catalog_history,
  custom_field_definitions: db.custom_field_definitions,
  speakers: db.speakers,
  orthographies: db.orthographies,
  orthography_bridges: db.orthography_bridges,
  orthography_transforms: db.orthography_bridges,
  locations: db.locations,
  bibliographic_sources: db.bibliographic_sources,
  grammar_docs: db.grammar_docs,
  abbreviations: db.abbreviations,
  structural_rule_profiles: db.structural_rule_profiles,
  phonemes: db.phonemes,
  tag_definitions: db.tag_definitions,
  layer_units: db.layer_units,
  layer_unit_contents: db.layer_unit_contents,
  unit_relations: db.unit_relations,
  layer_links: db.layer_links,
  tier_definitions: db.tier_definitions,
  tier_annotations: db.tier_annotations,
  audit_logs: db.audit_logs,
  user_notes: db.user_notes,
  segment_meta: db.segment_meta,
  segment_quality_snapshots: db.segment_quality_snapshots,
  scope_stats_snapshots: db.scope_stats_snapshots,
  speaker_profile_snapshots: db.speaker_profile_snapshots,
  translation_status_snapshots: db.translation_status_snapshots,
  language_asset_overviews: db.language_asset_overviews,
  ai_task_snapshots: db.ai_task_snapshots,
  track_entities: db.track_entities,
};

const validatorByCollection: Record<KnownCollectionName, (value: unknown) => void> = {
  texts: (value) => validateTextDoc(value as TextDocType),
  media_items: (value) => validateMediaItemDoc(value as MediaItemDocType),
  unit_tokens: (value) => validateUnitTokenDoc(value as UnitTokenDocType),
  unit_morphemes: (value) => validateUnitMorphemeDoc(value as UnitMorphemeDocType),
  anchors: (value) => validateAnchorDoc(value as AnchorDocType),
  lexemes: (value) => validateLexemeDoc(value as LexemeDocType),
  token_lexeme_links: (value) => validateTokenLexemeLinkDoc(value as TokenLexemeLinkDocType),
  ai_tasks: (value) => validateAiTaskDoc(value as AiTaskDoc),
  embeddings: (value) => validateEmbeddingDoc(value as EmbeddingDoc),
  ai_conversations: (value) => validateAiConversationDoc(value as AiConversationDoc),
  ai_messages: (value) => validateAiMessageDoc(value as AiMessageDoc),
  languages: (value) => validateLanguageDoc(value as LanguageDocType),
  language_display_names: (value) => validateLanguageDisplayNameDoc(value as LanguageDisplayNameDocType),
  language_aliases: (value) => validateLanguageAliasDoc(value as LanguageAliasDocType),
  language_catalog_history: (value) => validateLanguageCatalogHistoryDoc(value as LanguageCatalogHistoryDocType),
  custom_field_definitions: (value) => validateCustomFieldDefinitionDoc(value as CustomFieldDefinitionDocType),
  speakers: (value) => validateSpeakerDoc(value as SpeakerDocType),
  orthographies: (value) => validateOrthographyDoc(value as OrthographyDocType),
  orthography_bridges: (value) => validateOrthographyBridgeDoc(value as OrthographyBridgeDocType),
  orthography_transforms: (value) => validateOrthographyBridgeDoc(value as OrthographyBridgeDocType),
  locations: (value) => validateLocationDoc(value as LocationDocType),
  bibliographic_sources: (value) => validateBibliographicSourceDoc(value as BibliographicSourceDocType),
  grammar_docs: (value) => validateGrammarDoc(value as GrammarDocDocType),
  abbreviations: (value) => validateAbbreviationDoc(value as AbbreviationDocType),
  structural_rule_profiles: (value) => validateStructuralRuleProfileAssetDoc(value as StructuralRuleProfileAssetDocType),
  phonemes: (value) => validatePhonemeDoc(value as PhonemeDocType),
  tag_definitions: (value) => validateTagDefinitionDoc(value as TagDefinitionDocType),
  layers: (value) => validateLayerDoc(value as LayerDocType),
  layer_units: (value) => validateLayerUnitDoc(value as LayerUnitDocType),
  layer_unit_contents: (value) => validateLayerUnitContentDoc(value as LayerUnitContentDocType),
  unit_relations: (value) => validateUnitRelationDoc(value as UnitRelationDocType),
  layer_links: (value) => validateLayerLinkDoc(value as LayerLinkDocType),
  tier_definitions: (value) => validateTierDefinitionDoc(value as TierDefinitionDocType),
  tier_annotations: (value) => validateTierAnnotationDoc(value as TierAnnotationDocType),
  audit_logs: (value) => validateAuditLogDoc(value as AuditLogDocType),
  user_notes: (value) => validateUserNoteDoc(value as UserNoteDocType),
  segment_meta: (value) => validateSegmentMetaDoc(value as SegmentMetaDocType),
  segment_quality_snapshots: (value) => validateSegmentQualitySnapshotDoc(value as SegmentQualitySnapshotDocType),
  scope_stats_snapshots: (value) => validateScopeStatsSnapshotDoc(value as ScopeStatsSnapshotDocType),
  speaker_profile_snapshots: (value) => validateSpeakerProfileSnapshotDoc(value as SpeakerProfileSnapshotDocType),
  translation_status_snapshots: (value) => validateTranslationStatusSnapshotDoc(value as TranslationStatusSnapshotDocType),
  language_asset_overviews: (value) => validateLanguageAssetOverviewDoc(value as LanguageAssetOverviewDocType),
  ai_task_snapshots: (value) => validateAiTaskSnapshotDoc(value as AiTaskSnapshotDocType),
  track_entities: (value) => validateTrackEntityDoc(value as TrackEntityDocType),
};

function ensureImportProvenance<T extends { provenance?: ProvenanceEnvelope | undefined; createdAt?: string | undefined }>(
  doc: T,
  fallbackCreatedAt: string,
): T {
  if (doc.provenance) return doc;
  return {
    ...doc,
    provenance: {
      actorType: 'importer',
      method: 'import',
      createdAt: doc.createdAt ?? fallbackCreatedAt,
    },
  };
}

function ensureSnapshotJsonSizeWithinLimit(raw: string): void {
  const sizeBytes = new TextEncoder().encode(raw).byteLength;
  if (sizeBytes > SNAPSHOT_IMPORT_MAX_JSON_BYTES) {
    throw new Error(
      `Snapshot JSON size exceeds limit (${SNAPSHOT_IMPORT_MAX_JSON_BYTES} bytes).`,
    );
  }
}

function validateSnapshotJsonStructure(value: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value: node, depth } = current;

    if (depth > SNAPSHOT_IMPORT_MAX_JSON_DEPTH) {
      throw new Error(`Snapshot JSON depth exceeds limit (${SNAPSHOT_IMPORT_MAX_JSON_DEPTH}).`);
    }
    if (node === null || typeof node !== 'object') continue;

    nodeCount += 1;
    if (nodeCount > SNAPSHOT_IMPORT_MAX_JSON_NODES) {
      throw new Error(`Snapshot JSON node count exceeds limit (${SNAPSHOT_IMPORT_MAX_JSON_NODES}).`);
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        stack.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      const record = node as Record<string, unknown>;
      stack.push({ value: record[key], depth: depth + 1 });
    }
  }
}

function normalizeImportedDoc(collectionName: KnownCollectionName, doc: unknown, fallbackCreatedAt: string): unknown {
  if (!doc || typeof doc !== 'object') return doc;

  switch (collectionName) {
    case 'unit_tokens':
      return ensureImportProvenance(
        { ...(doc as Record<string, unknown>) } as unknown as UnitTokenDocType,
        fallbackCreatedAt,
      );
    case 'unit_morphemes':
      return ensureImportProvenance(
        { ...(doc as Record<string, unknown>) } as unknown as UnitMorphemeDocType,
        fallbackCreatedAt,
      );
    case 'layer_units':
      return ensureImportProvenance(doc as LayerUnitDocType, fallbackCreatedAt);
    case 'layer_unit_contents':
      return ensureImportProvenance(doc as LayerUnitContentDocType, fallbackCreatedAt);
    case 'unit_relations':
      return ensureImportProvenance(doc as UnitRelationDocType, fallbackCreatedAt);
    case 'tier_annotations':
      return ensureImportProvenance(doc as TierAnnotationDocType, fallbackCreatedAt);
    case 'user_notes':
      return ensureImportProvenance(doc as UserNoteDocType, fallbackCreatedAt);
    case 'track_entities':
      return doc;
    case 'lexemes':
      return ensureImportProvenance(doc as LexemeDocType, fallbackCreatedAt);
    case 'token_lexeme_links':
      return ensureImportProvenance(doc as TokenLexemeLinkDocType, fallbackCreatedAt);
    case 'phonemes':
      return ensureImportProvenance(doc as PhonemeDocType, fallbackCreatedAt);
    default:
      return doc;
  }
}

async function pruneOrphanUserNotes(): Promise<number> {
  const notes = await db.user_notes.toArray();
  if (notes.length === 0) return 0;

  const unitIds = new Set<string>();
  const textIds = new Set<string>();
  const lexemeIds = new Set<string>();
  const annotationIds = new Set<string>();
  const tokenIds = new Set<string>();
  const morphemeIds = new Set<string>();

  for (const note of notes) {
    if (note.targetType === 'unit') unitIds.add(note.targetId);
    if (note.targetType === 'text') textIds.add(note.targetId);
    if (note.targetType === 'lexeme') lexemeIds.add(note.targetId);
    if (note.targetType === 'tier_annotation' && !note.targetId.includes('::')) annotationIds.add(note.targetId);
    if (note.targetType === 'token') tokenIds.add(note.targetId);
    if (note.targetType === 'morpheme') morphemeIds.add(note.targetId);
  }

  const existingUnitIds = new Set(
    (await db.layer_units.bulkGet([...unitIds])).flatMap((d) => (
      d && d.unitType === 'unit' && d.id ? [d.id] : []
    )),
  );
  const existingTextIds = new Set((await db.texts.bulkGet([...textIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingLexemeIds = new Set((await db.lexemes.bulkGet([...lexemeIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingAnnotationIds = new Set((await db.tier_annotations.bulkGet([...annotationIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingTokenIds = new Set((await db.unit_tokens.bulkGet([...tokenIds])).flatMap((d) => (d?.id ? [d.id] : [])));
  const existingMorphemeIds = new Set((await db.unit_morphemes.bulkGet([...morphemeIds])).flatMap((d) => (d?.id ? [d.id] : [])));

  const orphanIds: string[] = [];
  for (const note of notes) {
    if (note.targetType === 'unit' && !existingUnitIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'text' && !existingTextIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'lexeme' && !existingLexemeIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'tier_annotation' && !note.targetId.includes('::') && !existingAnnotationIds.has(note.targetId)) {
      orphanIds.push(note.id);
    }
    if (note.targetType === 'token' && !existingTokenIds.has(note.targetId)) orphanIds.push(note.id);
    if (note.targetType === 'morpheme' && !existingMorphemeIds.has(note.targetId)) orphanIds.push(note.id);
  }

  if (orphanIds.length > 0) {
    await db.user_notes.bulkDelete(orphanIds);
  }

  return orphanIds.length;
}

export async function importDatabaseFromJson(
  input: unknown,
  options?: { strategy?: ImportConflictStrategy },
): Promise<ImportResult> {
  const strategy = options?.strategy ?? 'upsert';
  let parsedRaw: unknown;
  try {
    if (typeof input === 'string') {
      ensureSnapshotJsonSizeWithinLimit(input);
      parsedRaw = JSON.parse(input);
    } else {
      const serialized = JSON.stringify(input);
      ensureSnapshotJsonSizeWithinLimit(serialized);
      parsedRaw = input;
    }
  } catch (e) {
    if (e instanceof Error && /Snapshot JSON (size|depth|node count) exceeds limit/i.test(e.message)) {
      throw e;
    }
    throw new Error(`Invalid JSON input: ${e instanceof Error ? e.message : 'unknown parse error'}`);
  }
  validateSnapshotJsonStructure(parsedRaw);
  const snapshot = databaseSnapshotSchema.parse(parsedRaw);

  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported snapshot schemaVersion=${snapshot.schemaVersion}; only schemaVersion=${SNAPSHOT_SCHEMA_VERSION} (current app export) is accepted.`,
    );
  }

  if ('unit_texts' in snapshot.collections) {
    throw new Error('Legacy collection "unit_texts" is no longer supported; import a LayerUnit snapshot.');
  }

  const result: ImportResult = {
    importedAt: new Date().toISOString(),
    strategy,
    collections: {},
    ignoredCollections: [],
  };
  const importStartedAt = result.importedAt;

  const cols = snapshot.collections as Record<string, unknown[]>;
  if (!Array.isArray(cols['layer_units'])) cols['layer_units'] = [];
  if (!Array.isArray(cols['layer_unit_contents'])) cols['layer_unit_contents'] = [];

  const legacyUnits = cols['units'];
  if (Array.isArray(legacyUnits) && legacyUnits.length > 0) {
    throw new Error(
      'Legacy snapshot key "units" is not supported; import layer_units + layer_unit_contents from a current app export.',
    );
  }
  if ('units' in cols) {
    delete cols['units'];
  }

  const dbInstance = await getDb();

  // 合并遗留 orthography_transforms 到 orthography_bridges，避免双映射写入冲突
  // Merge legacy orthography_transforms into orthography_bridges to avoid dual-mapping write conflicts
  if ('orthography_transforms' in snapshot.collections && 'orthography_bridges' in snapshot.collections) {
    const bridgeDocs = snapshot.collections['orthography_bridges'] as Array<{ id?: string }>;
    const transformDocs = snapshot.collections['orthography_transforms'] as Array<{ id?: string }>;
    const bridgeIds = new Set(bridgeDocs.map((d) => d.id));
    const deduped = transformDocs.filter((d) => !bridgeIds.has(d.id));
    snapshot.collections['orthography_bridges'] = [...bridgeDocs, ...deduped];
    delete snapshot.collections['orthography_transforms'];
  } else if ('orthography_transforms' in snapshot.collections) {
    snapshot.collections['orthography_bridges'] = snapshot.collections['orthography_transforms']!;
    delete snapshot.collections['orthography_transforms'];
  }

  const preparedCollections: Array<{
    collectionName: KnownCollectionName;
    received: number;
    normalizedDocs: unknown[];
  }> = [];

  for (const [name, docs] of Object.entries(snapshot.collections)) {
    if (!knownCollectionNames.includes(name as KnownCollectionName)) {
      result.ignoredCollections.push(name);
      continue;
    }

    const collectionName = name as KnownCollectionName;
    const normalizedDocs = docs.map((doc) => normalizeImportedDoc(collectionName, doc, importStartedAt));

    for (const doc of normalizedDocs) {
      const candidate = doc as { id?: unknown };
      if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
        throw new Error(`Invalid doc in ${collectionName}: missing non-empty id`);
      }

      if (collectionName === 'media_items') {
        const details = (doc as Record<string, unknown>)['details'] as Record<string, unknown> | undefined;
        const audioDataUrl = details?.['audioDataUrl'];
        if (details && typeof audioDataUrl === 'string') {
          const trimmedAudioDataUrl = audioDataUrl.trim();
          if (!/^data:/i.test(trimmedAudioDataUrl)) {
            throw new Error(`Invalid media_items.details.audioDataUrl in ${collectionName}: only data URLs are supported during import`);
          }
          const resp = await fetch(trimmedAudioDataUrl);
          details['audioBlob'] = await resp.blob();
          delete details['audioDataUrl'];
        }
      }

      validatorByCollection[collectionName](doc);
    }

    preparedCollections.push({
      collectionName,
      received: docs.length,
      normalizedDocs,
    });
  }

  // ADR-0006: One `rw` Dexie transaction whose scope is the dynamic union of `tier_definitions` plus every
  // Dexie `Table` in `tableByCollection`. The callback only touches stores in that list; `layers` uses
  // RxDB (`dbInstance.collections.layers`), not additional IDB stores on this transaction.
  const txTables = [
    dbInstance.dexie.tier_definitions as Table<any, any>,
    ...Object.values(tableByCollection)
      .filter((table): table is Table<{ id: string }, string> => Boolean(table))
      .map((table) => table as Table<any, any>),
  ];
  const txTablesTuple = txTables as [Table<any, any>, ...Table<any, any>[]];
  const transactionAny = dbInstance.dexie.transaction as (...args: any[]) => Promise<void>;

  await transactionAny.apply(dbInstance.dexie, ['rw', ...txTablesTuple, async () => {
    for (const prepared of preparedCollections) {
      const { collectionName, normalizedDocs, received } = prepared;
      const resultCollectionName = (
        collectionName === 'orthography_transforms' ? 'orthography_bridges' : collectionName
      ) as keyof JieyuCollections;

      if (collectionName === 'layers') {
        const collection = dbInstance.collections.layers;
        let written = 0;
        let skipped = 0;

        if (strategy === 'replace-all') {
          const existing = await collection.find().exec();
          for (const row of existing) {
            await collection.remove(row.primary);
          }
        }

        if (strategy === 'skip-existing') {
          for (const doc of normalizedDocs as LayerDocType[]) {
            const existing = await collection.findOne({ selector: { id: doc.id } }).exec();
            if (existing) {
              skipped += 1;
              continue;
            }
            await collection.insert(doc);
            written += 1;
          }
        } else {
          for (const doc of normalizedDocs as LayerDocType[]) {
            await collection.insert(doc);
            written += 1;
          }
        }

        result.collections[resultCollectionName] = {
          received,
          written,
          skipped,
        };
        continue;
      }

      const table = tableByCollection[collectionName];
      if (!table) {
        result.ignoredCollections.push(collectionName);
        continue;
      }

      let written = 0;
      let skipped = 0;

      if (strategy === 'replace-all') {
        await table.clear();
      }

      if (strategy === 'skip-existing') {
        const existingDocs = await table.bulkGet(normalizedDocs.map((doc) => (doc as { id: string }).id));
        const toInsert = normalizedDocs.filter((_, index) => !existingDocs[index]);
        skipped = normalizedDocs.length - toInsert.length;
        if (toInsert.length > 0) {
          await table.bulkPut(toInsert as Array<{ id: string }>);
        }
        written = toInsert.length;
      } else {
        if (normalizedDocs.length > 0) {
          await table.bulkPut(normalizedDocs as Array<{ id: string }>);
        }
        written = normalizedDocs.length;
      }

      result.collections[resultCollectionName] = {
        received,
        written,
        skipped,
      };
    }

    await pruneOrphanUserNotes();
  }]);

  return result;
}

