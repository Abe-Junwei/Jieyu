/**
 * 基线 stores（与旧 v54 最终结构等价；物理表 `orthography_transforms` 更名为 `orthography_bridges`）。
 * 单独成文件，避免 engine ↔ migration/schemaVersions 循环引用。
 * Baseline stores (≡ former v54 final shape; physical `orthography_transforms` renamed to `orthography_bridges`).
 * Own module to avoid an engine <-> migration/schemaVersions import cycle.
 */
export const JIEYU_BASELINE_STORES = {
  abbreviations: 'id, abbreviation',
  agent_artifacts: 'id, kind, uri, createdAt, adoptionItemId',
  ai_conversations: 'id, textId, updatedAt, archived',
  ai_messages: 'id, conversationId, [conversationId+createdAt], status, updatedAt',
  ai_session_memories: 'conversationId, updatedAt',
  ai_source_sets: 'id, status, boundSessionId, updatedAt',
  ai_task_snapshots: 'id, taskId, taskType, status, targetId, updatedAt',
  ai_tasks: 'id, taskType, status, targetId, createdAt, updatedAt',
  anchors: 'id, mediaId, [mediaId+time], time',
  audit_logs:
    'id, collection, documentId, [collection+action], action, timestamp, [collection+field+timestamp], requestId, [collection+field+requestId]',
  bibliographic_sources: 'id, citationKey',
  custom_field_definitions: 'id, sortOrder, updatedAt',
  embeddings: 'id, sourceType, sourceId, [sourceType+model], model, contentHash, createdAt',
  external_mcp_trust: 'id, origin, enabled, updatedAt',
  grammar_docs: 'id, updatedAt, parentId',
  language_aliases:
    'id, languageId, normalizedAlias, aliasType, locale, [languageId+normalizedAlias], [normalizedAlias+languageId], [languageId+aliasType], updatedAt',
  language_asset_overviews:
    'id, languageId, displayName, aliasCount, orthographyCount, bridgeCount, updatedAt',
  language_catalog_history: 'id, languageId, action, createdAt, [languageId+createdAt]',
  language_display_names:
    'id, languageId, locale, role, [languageId+locale], [languageId+role], [languageId+locale+role], [locale+value], updatedAt',
  languages:
    'id, languageCode, canonicalTag, iso6393, sourceType, reviewStatus, visibility, family, macrolanguage, updatedAt',
  layer_links:
    'id, transcriptionLayerKey, hostTranscriptionLayerId, layerId, [layerId+hostTranscriptionLayerId]',
  layer_unit_contents:
    'id, textId, unitId, layerId, contentRole, [unitId+contentRole], [contentRole+updatedAt], sourceType, [layerId+updatedAt], updatedAt',
  layer_units:
    'id, textId, mediaId, layerId, unitType, parentUnitId, rootUnitId, speakerId, [layerId+mediaId], [layerId+startTime], [mediaId+startTime], [parentUnitId+startTime], [layerId+unitType], [textId+layerId]',
  lexeme_asset_links: 'id, lexemeId, assetId, [lexemeId+assetId], createdAt',
  lexeme_assets:
    'id, kind, mimeType, displayName, languageCode, byteSize, refCount, createdAt, updatedAt',
  lexemes: 'id, updatedAt',
  locations: 'id, country, region',
  mcp_tool_call_audits: 'id, timestamp, toolName, outcome, [toolName+timestamp]',
  media_items: 'id, textId, createdAt',
  orthographies: 'id, languageId',
  orthography_bridges:
    'id, sourceOrthographyId, targetOrthographyId, [sourceOrthographyId+targetOrthographyId], engine, status, updatedAt',
  phonemes: 'id, languageId, type',
  project_ai_memories: 'id, projectId, [projectId+updatedAt], createdAt, updatedAt',
  scope_stats_snapshots:
    'id, scopeType, scopeKey, textId, mediaId, layerId, speakerId, [scopeType+scopeKey], [textId+scopeType], updatedAt',
  segment_meta:
    'id, segmentId, unitKind, textId, mediaId, layerId, hostUnitId, effectiveSpeakerId, effectiveSelfCertainty, annotationStatus, *noteCategoryKeys, [layerId+mediaId], [textId+layerId], [layerId+updatedAt], updatedAt',
  segment_quality_snapshots:
    'id, segmentId, textId, mediaId, layerId, severity, [layerId+mediaId], [textId+layerId], [layerId+severity], updatedAt',
  speaker_profile_snapshots: 'id, textId, speakerId, [textId+speakerId], updatedAt',
  speakers: 'id, updatedAt',
  structural_rule_profiles: 'id, scope, languageId, projectId, enabled, priority, updatedAt',
  tag_definitions: 'id, key',
  texts: 'id, updatedAt, languageCode',
  tier_annotations:
    'id, tierId, parentAnnotationId, [tierId+startTime], startTime, endTime, startAnchorId, endAnchorId',
  tier_definitions: 'id, textId, key, parentTierId, tierType, contentType',
  token_lexeme_links: 'id, [targetType+targetId], lexemeId, [lexemeId+targetType]',
  track_entities: 'id, textId, mediaId, [textId+mediaId]',
  // 2B-D：导入来源（rev5 4.1），冻结点之前直接写进基线 | 2B-D import sources, added to the pre-freeze baseline
  source_records: 'id, textId, [textId+externalDocId], [textId+sha256], importBatchId, mediaId',
  // 2B-E：标注文档（rev5 4.1 / 4.2-8）| 2B-E annotation documents
  annotation_documents: 'id, textId',
  translation_status_snapshots:
    'id, unitId, textId, mediaId, layerId, status, [layerId+mediaId], [textId+layerId], updatedAt',
  unit_morphemes: 'id, textId, unitId, tokenId, [tokenId+morphemeIndex], lexemeId',
  unit_relations:
    'id, textId, sourceUnitId, targetUnitId, relationType, unitId, [unitId+relationType], [sourceUnitId+relationType], [targetUnitId+relationType]',
  unit_tokens: 'id, textId, unitId, [unitId+tokenIndex], lexemeId',
  user_notes: 'id, [targetType+targetId], [targetId+targetIndex], updatedAt',
} as const satisfies Record<string, string>;
