/**
 * ADR-0006: central Dexie object-store lists for transactions whose callbacks touch multiple tables.
 * Spread into `db.dexie.transaction(mode, ...stores, scope)` so declared scope matches callee access.
 */
import type { JieyuDatabase } from './engine';

/** Read scope aligned with `getUnitDocProjectionById` (units + primary content + speaker name). */
export function dexieStoresForUnitDocProjectionRead(db: JieyuDatabase) {
  return [db.dexie.layer_units, db.dexie.layer_unit_contents, db.dexie.speakers] as const;
}

/**
 * Read scope for AI `get_unit_linguistic_memory`: canonical unit row, `listUnitTextsByUnit` (layer graph),
 * lexical rows, note rows, and layer/tier metadata needed to label translations.
 */
export function dexieStoresForGetUnitLinguisticMemoryRead(db: JieyuDatabase) {
  return [
    db.dexie.layer_units,
    db.dexie.layer_unit_contents,
    db.dexie.unit_tokens,
    db.dexie.unit_morphemes,
    db.dexie.user_notes,
    db.dexie.tier_definitions,
  ] as const;
}

/** `LinguisticService.deleteAudio`: `media_items` + `texts` + `LayerSegmentQueryService.listUnits*` on `layer_units`. */
export function dexieStoresForDeleteAudioKeepTimeline(db: JieyuDatabase) {
  return [db.dexie.media_items, db.dexie.texts, db.dexie.layer_units] as const;
}

/** Hydrate units from Dexie when local React state lacks rows (`layer_units` bulkGet). */
export function dexieStoresForLayerUnitsTableRead(db: JieyuDatabase) {
  return [db.dexie.layer_units] as const;
}

/** RW: canonical segment/unit graph — cascade deletes, snapshot restore, V2 graph ops. */
export function dexieStoresForLayerSegmentGraphRw(db: JieyuDatabase) {
  return [db.dexie.layer_units, db.dexie.layer_unit_contents, db.dexie.unit_relations] as const;
}

/** RW: `layer_units` + `layer_unit_contents` (segment+content upsert without relations in same txn). */
export function dexieStoresForLayerUnitsAndContentsRw(db: JieyuDatabase) {
  return [db.dexie.layer_units, db.dexie.layer_unit_contents] as const;
}

/** RW: `layer_units` + `unit_relations` (e.g. time_subdivision segment + link). */
export function dexieStoresForLayerUnitsAndUnitRelationsRw(db: JieyuDatabase) {
  return [db.dexie.layer_units, db.dexie.unit_relations] as const;
}

/** RW: `layer_units` only. */
export function dexieStoresForLayerUnitsRw(db: JieyuDatabase) {
  return [db.dexie.layer_units] as const;
}

// ── P2 / ADR-0006: segment_meta materialization, workspace snapshots, tier atomicity ──

/** RW: derived `segment_meta` rows only (`replaceDocsForLayerMedia`, `rebuildForLayerMedia` write phase). */
export function dexieStoresForSegmentMetaRw(db: JieyuDatabase) {
  return [db.dexie.segment_meta] as const;
}

/** Read: `SegmentMetaService.syncForUnitIds` — canonical units + stale meta rows by segment/host id. */
export function dexieStoresForSegmentMetaSyncForUnitIdsRead(db: JieyuDatabase) {
  return [db.dexie.layer_units, db.dexie.segment_meta] as const;
}

/**
 * Read: `SegmentMetaService.rebuildForLayerMedia` first phase — units/contents + notes + speakers.
 * Follow-up host `bulkGet` uses `dexieStoresForLayerUnitsTableRead` in a separate read txn by design.
 */
export function dexieStoresForSegmentMetaRebuildSourceRead(db: JieyuDatabase) {
  return [
    db.dexie.layer_units,
    db.dexie.layer_unit_contents,
    db.dexie.user_notes,
    db.dexie.speakers,
  ] as const;
}

/** RW: workspace read-model snapshot tables rebuilt together in `WorkspaceReadModelService.rebuildForText`. */
export function dexieStoresForWorkspaceSnapshotRebuildRw(db: JieyuDatabase) {
  return [
    db.dexie.segment_quality_snapshots,
    db.dexie.scope_stats_snapshots,
    db.dexie.speaker_profile_snapshots,
    db.dexie.translation_status_snapshots,
  ] as const;
}

/** RW: `WorkspaceReadModelService.rebuildLanguageAssetOverview` — derived overview rows only. */
export function dexieStoresForLanguageAssetOverviewRw(db: JieyuDatabase) {
  return [db.dexie.language_asset_overviews] as const;
}

/** RW: `WorkspaceReadModelService.rebuildAiTaskSnapshots` — `ai_task_snapshots` only (`ai_tasks` read outside txn). */
export function dexieStoresForAiTaskSnapshotsRw(db: JieyuDatabase) {
  return [db.dexie.ai_task_snapshots] as const;
}

/** RW: `persistTierAnnotation` / batch — Dexie tables touched inside the atomic callback. */
export function dexieStoresForTierAnnotationAtomicRw(db: JieyuDatabase) {
  return [db.dexie.tier_annotations, db.dexie.anchors, db.dexie.audit_logs] as const;
}

/** RW: `saveTierDefinition` / `removeTierDefinition` — tier defs plus cascaded annotations/anchors/audit logs. */
export function dexieStoresForTierDefinitionAtomicRw(db: JieyuDatabase) {
  return [db.dexie.tier_definitions, db.dexie.tier_annotations, db.dexie.anchors, db.dexie.audit_logs] as const;
}

// ── P3+: track UI state, language catalog, orthography, project/unit cascade deletes ──

/** RW: `track_entities` only (`TrackEntityStore.saveTrackEntityStateMapToDb`). */
export function dexieStoresForTrackEntitiesRw(db: JieyuDatabase) {
  return [db.dexie.track_entities] as const;
}

/** Read: `readLanguageCatalogProjection` — languages + display names + aliases. */
export function dexieStoresForLanguageCatalogProjectionRead(db: JieyuDatabase) {
  return [db.dexie.languages, db.dexie.language_display_names, db.dexie.language_aliases] as const;
}

/** RW: language catalog upsert/delete + history row (`LinguisticService.languageCatalog`). */
export function dexieStoresForLanguageCatalogMutateRw(db: JieyuDatabase) {
  return [
    db.dexie.languages,
    db.dexie.language_display_names,
    db.dexie.language_aliases,
    db.dexie.language_catalog_history,
  ] as const;
}

/** RW: custom field definition delete strips references from `languages`. */
export function dexieStoresForCustomFieldDefinitionDeleteCascadeRw(db: JieyuDatabase) {
  return [db.dexie.custom_field_definitions, db.dexie.languages] as const;
}

/** RW: orthography bridge upsert with existence checks on `orthographies`. */
export function dexieStoresForOrthographyBridgeUpsertRw(db: JieyuDatabase) {
  return [db.dexie.orthography_bridges, db.dexie.orthographies] as const;
}

/**
 * RW: `LinguisticService.removeUnit` / `removeUnitsBatch` — embeddings, canonical graph,
 * lexicon, notes, anchors (same store set for both entry points).
 */
export function dexieStoresForRemoveUnitCascadeRw(db: JieyuDatabase) {
  return [
    db.dexie.embeddings,
    db.dexie.layer_unit_contents,
    db.dexie.layer_units,
    db.dexie.unit_relations,
    db.dexie.unit_tokens,
    db.dexie.unit_morphemes,
    db.dexie.token_lexeme_links,
    db.dexie.user_notes,
    db.dexie.anchors,
  ] as const;
}

/** RW: `LinguisticService.deleteProject` — full text cascade across Dexie tables listed here. */
export function dexieStoresForDeleteProjectByTextIdCascadeRw(db: JieyuDatabase) {
  return [
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
  ] as const;
}
