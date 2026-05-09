import { z } from 'zod';
import type {
  AbbreviationDocType,
  AiConversationDoc,
  AiMessageDoc,
  AiTaskDoc,
  AiTaskSnapshotDocType,
  AnchorDocType,
  ProjectAiMemoryDoc,
  McpToolCallAuditDoc,
  AuditLogDocType,
  BibliographicSourceDocType,
  CustomFieldDefinitionDocType,
  EmbeddingDoc,
  GrammarDocDocType,
  LanguageAliasDocType,
  LanguageAssetOverviewDocType,
  LanguageCatalogHistoryDocType,
  LanguageDisplayNameDocType,
  LanguageDocType,
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  LexemeDocType,
  LocationDocType,
  MediaItemDocType,
  OrthographyBridgeDocType,
  OrthographyDocType,
  PhonemeDocType,
  ScopeStatsSnapshotDocType,
  SegmentMetaDocType,
  SegmentQualitySnapshotDocType,
  SpeakerDocType,
  SpeakerProfileSnapshotDocType,
  StructuralRuleProfileAssetDocType,
  TagDefinitionDocType,
  TextDocType,
  TierAnnotationDocType,
  TierDefinitionDocType,
  TokenLexemeLinkDocType,
  TrackEntityDocType,
  TranslationStatusSnapshotDocType,
  UnitMorphemeDocType,
  UnitRelationDocType,
  UnitTokenDocType,
  UserNoteDocType,
} from './types';
import {
  isoDateSchema,
  validateAbbreviationDoc,
  validateAiConversationDoc,
  validateAiMessageDoc,
  validateAiTaskDoc,
  validateAiTaskSnapshotDoc,
  validateAnchorDoc,
  validateProjectAiMemoryDoc,
  validateMcpToolCallAuditDoc,
  validateAuditLogDoc,
  validateBibliographicSourceDoc,
  validateCustomFieldDefinitionDoc,
  validateEmbeddingDoc,
  validateGrammarDoc,
  validateLanguageAliasDoc,
  validateLanguageAssetOverviewDoc,
  validateLanguageCatalogHistoryDoc,
  validateLanguageDisplayNameDoc,
  validateLanguageDoc,
  validateLayerDoc,
  validateLayerLinkDoc,
  validateLayerUnitContentDoc,
  validateLayerUnitDoc,
  validateLexemeDoc,
  validateLocationDoc,
  validateMediaItemDoc,
  validateOrthographyBridgeDoc,
  validateOrthographyDoc,
  validatePhonemeDoc,
  validateScopeStatsSnapshotDoc,
  validateSegmentMetaDoc,
  validateSegmentQualitySnapshotDoc,
  validateSpeakerDoc,
  validateSpeakerProfileSnapshotDoc,
  validateStructuralRuleProfileAssetDoc,
  validateTagDefinitionDoc,
  validateTextDoc,
  validateTierAnnotationDoc,
  validateTierDefinitionDoc,
  validateTokenLexemeLinkDoc,
  validateTrackEntityDoc,
  validateTranslationStatusSnapshotDoc,
  validateUnitMorphemeDoc,
  validateUnitRelationDoc,
  validateUnitTokenDoc,
  validateUserNoteDoc,
} from './schemas';

const databaseSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDateSchema.optional(),
  dbName: z.string().optional(),
  collections: z.record(z.string(), z.array(z.unknown())),
});

export type ParsedDatabaseSnapshot = z.infer<typeof databaseSnapshotSchema>;

export function parseDatabaseSnapshot(input: unknown): ParsedDatabaseSnapshot {
  return databaseSnapshotSchema.parse(input);
}

const validatorByCollection = {
  texts: (value: unknown) => validateTextDoc(value as TextDocType),
  media_items: (value: unknown) => validateMediaItemDoc(value as MediaItemDocType),
  unit_tokens: (value: unknown) => validateUnitTokenDoc(value as UnitTokenDocType),
  unit_morphemes: (value: unknown) => validateUnitMorphemeDoc(value as UnitMorphemeDocType),
  anchors: (value: unknown) => validateAnchorDoc(value as AnchorDocType),
  lexemes: (value: unknown) => validateLexemeDoc(value as LexemeDocType),
  token_lexeme_links: (value: unknown) =>
    validateTokenLexemeLinkDoc(value as TokenLexemeLinkDocType),
  ai_tasks: (value: unknown) => validateAiTaskDoc(value as AiTaskDoc),
  embeddings: (value: unknown) => validateEmbeddingDoc(value as EmbeddingDoc),
  ai_conversations: (value: unknown) => validateAiConversationDoc(value as AiConversationDoc),
  ai_messages: (value: unknown) => validateAiMessageDoc(value as AiMessageDoc),
  languages: (value: unknown) => validateLanguageDoc(value as LanguageDocType),
  language_display_names: (value: unknown) =>
    validateLanguageDisplayNameDoc(value as LanguageDisplayNameDocType),
  language_aliases: (value: unknown) => validateLanguageAliasDoc(value as LanguageAliasDocType),
  language_catalog_history: (value: unknown) =>
    validateLanguageCatalogHistoryDoc(value as LanguageCatalogHistoryDocType),
  custom_field_definitions: (value: unknown) =>
    validateCustomFieldDefinitionDoc(value as CustomFieldDefinitionDocType),
  speakers: (value: unknown) => validateSpeakerDoc(value as SpeakerDocType),
  orthographies: (value: unknown) => validateOrthographyDoc(value as OrthographyDocType),
  orthography_bridges: (value: unknown) =>
    validateOrthographyBridgeDoc(value as OrthographyBridgeDocType),
  orthography_transforms: (value: unknown) =>
    validateOrthographyBridgeDoc(value as OrthographyBridgeDocType),
  locations: (value: unknown) => validateLocationDoc(value as LocationDocType),
  bibliographic_sources: (value: unknown) =>
    validateBibliographicSourceDoc(value as BibliographicSourceDocType),
  grammar_docs: (value: unknown) => validateGrammarDoc(value as GrammarDocDocType),
  abbreviations: (value: unknown) => validateAbbreviationDoc(value as AbbreviationDocType),
  structural_rule_profiles: (value: unknown) =>
    validateStructuralRuleProfileAssetDoc(value as StructuralRuleProfileAssetDocType),
  phonemes: (value: unknown) => validatePhonemeDoc(value as PhonemeDocType),
  tag_definitions: (value: unknown) => validateTagDefinitionDoc(value as TagDefinitionDocType),
  layers: (value: unknown) => validateLayerDoc(value as LayerDocType),
  layer_units: (value: unknown) => validateLayerUnitDoc(value as LayerUnitDocType),
  layer_unit_contents: (value: unknown) =>
    validateLayerUnitContentDoc(value as LayerUnitContentDocType),
  unit_relations: (value: unknown) => validateUnitRelationDoc(value as UnitRelationDocType),
  layer_links: (value: unknown) => validateLayerLinkDoc(value as LayerLinkDocType),
  tier_definitions: (value: unknown) => validateTierDefinitionDoc(value as TierDefinitionDocType),
  tier_annotations: (value: unknown) => validateTierAnnotationDoc(value as TierAnnotationDocType),
  audit_logs: (value: unknown) => validateAuditLogDoc(value as AuditLogDocType),
  user_notes: (value: unknown) => validateUserNoteDoc(value as UserNoteDocType),
  segment_meta: (value: unknown) => validateSegmentMetaDoc(value as SegmentMetaDocType),
  segment_quality_snapshots: (value: unknown) =>
    validateSegmentQualitySnapshotDoc(value as SegmentQualitySnapshotDocType),
  scope_stats_snapshots: (value: unknown) =>
    validateScopeStatsSnapshotDoc(value as ScopeStatsSnapshotDocType),
  speaker_profile_snapshots: (value: unknown) =>
    validateSpeakerProfileSnapshotDoc(value as SpeakerProfileSnapshotDocType),
  translation_status_snapshots: (value: unknown) =>
    validateTranslationStatusSnapshotDoc(value as TranslationStatusSnapshotDocType),
  language_asset_overviews: (value: unknown) =>
    validateLanguageAssetOverviewDoc(value as LanguageAssetOverviewDocType),
  ai_task_snapshots: (value: unknown) => validateAiTaskSnapshotDoc(value as AiTaskSnapshotDocType),
  track_entities: (value: unknown) => validateTrackEntityDoc(value as TrackEntityDocType),
  project_ai_memories: (value: unknown) => validateProjectAiMemoryDoc(value as ProjectAiMemoryDoc),
  mcp_tool_call_audits: (value: unknown) =>
    validateMcpToolCallAuditDoc(value as McpToolCallAuditDoc),
} as const satisfies Record<string, (value: unknown) => void>;

export function validateCollectionDoc(collectionName: string, value: unknown): void {
  const validator = validatorByCollection[collectionName as keyof typeof validatorByCollection];
  if (validator === undefined) {
    throw new Error(`Unsupported collection for validation: ${collectionName}`);
  }
  validator(value);
}
