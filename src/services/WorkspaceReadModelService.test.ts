import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type AiTaskDoc, type LanguageAliasDocType, type LanguageDisplayNameDocType, type LanguageDocType, type LayerDocType, type LayerUnitContentDocType, type LayerUnitDocType, type OrthographyBridgeDocType, type OrthographyDocType, type SpeakerDocType, type UserNoteDocType } from '../db';
import { SegmentMetaService } from './SegmentMetaService';
import { WorkspaceReadModelService } from './WorkspaceReadModelService';

const NOW = '2026-04-16T00:00:00.000Z';

function makeLayer(overrides: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'layerType'>): LayerDocType {
  return {
    id: overrides.id,
    textId: overrides.textId ?? 'text-1',
    key: overrides.key ?? overrides.id,
    name: overrides.name ?? { 'zh-CN': overrides.id },
    layerType: overrides.layerType,
    languageId: overrides.languageId ?? 'eng',
    modality: overrides.modality ?? 'text',
    ...(overrides.parentLayerId ? { parentLayerId: overrides.parentLayerId } : {}),
    ...(overrides.constraint ? { constraint: overrides.constraint } : {}),
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function makeUnit(overrides: Partial<LayerUnitDocType> & Pick<LayerUnitDocType, 'id' | 'layerId' | 'unitType' | 'startTime' | 'endTime'>): LayerUnitDocType {
  return {
    id: overrides.id,
    textId: overrides.textId ?? 'text-1',
    mediaId: overrides.mediaId ?? 'media-1',
    layerId: overrides.layerId,
    unitType: overrides.unitType,
    ...(overrides.parentUnitId ? { parentUnitId: overrides.parentUnitId } : {}),
    ...(overrides.rootUnitId ? { rootUnitId: overrides.rootUnitId } : {}),
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    ...(overrides.speakerId ? { speakerId: overrides.speakerId } : {}),
    ...(overrides.selfCertainty ? { selfCertainty: overrides.selfCertainty } : {}),
    ...(overrides.status ? { status: overrides.status } : {}),
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function makeContent(overrides: Partial<LayerUnitContentDocType> & Pick<LayerUnitContentDocType, 'id' | 'unitId' | 'layerId'>): LayerUnitContentDocType {
  return {
    id: overrides.id,
    textId: overrides.textId ?? 'text-1',
    unitId: overrides.unitId,
    layerId: overrides.layerId,
    contentRole: overrides.contentRole ?? 'primary_text',
    modality: overrides.modality ?? 'text',
    ...(overrides.text !== undefined ? { text: overrides.text } : {}),
    sourceType: overrides.sourceType ?? 'human',
    ...(overrides.ai_metadata ? { ai_metadata: overrides.ai_metadata } : {}),
    ...(overrides.isVerified !== undefined ? { isVerified: overrides.isVerified } : {}),
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function makeSpeaker(id: string, name: string): SpeakerDocType {
  return { id, name, createdAt: NOW, updatedAt: NOW };
}

function makeNote(id: string, targetId: string, category: UserNoteDocType['category']): UserNoteDocType {
  return {
    id,
    targetType: 'unit',
    targetId,
    ...(category ? { category } : {}),
    content: { 'zh-CN': '待确认' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLanguage(id: string, name: string): LanguageDocType {
  return {
    id,
    name: { eng: name },
    languageCode: id,
    canonicalTag: id,
    iso6393: id,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeAlias(id: string, languageId: string, alias: string): LanguageAliasDocType {
  return {
    id,
    languageId,
    alias,
    normalizedAlias: alias.toLowerCase(),
    aliasType: 'search',
    sourceType: 'user-custom',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeDisplayName(id: string, languageId: string, value: string): LanguageDisplayNameDocType {
  return {
    id,
    languageId,
    locale: 'zh-CN',
    role: 'preferred',
    value,
    sourceType: 'user-custom',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeOrthography(id: string, languageId: string): OrthographyDocType {
  return {
    id,
    languageId,
    name: { eng: id },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeBridge(id: string, sourceOrthographyId: string, targetOrthographyId: string): OrthographyBridgeDocType {
  return {
    id,
    sourceOrthographyId,
    targetOrthographyId,
    engine: 'table-map',
    rules: { mappings: [{ from: 'a', to: 'á' }] },
    status: 'active',
    createdAt: NOW,
    updatedAt: '2026-04-16T00:00:02.000Z',
  };
}

function makeAiTask(id: string): AiTaskDoc {
  return {
    id,
    taskType: 'translate',
    status: 'done',
    targetId: 'seg-1',
    targetType: 'segment',
    modelId: 'gpt-test',
    createdAt: NOW,
    updatedAt: '2026-04-16T00:00:05.000Z',
  };
}

describe('WorkspaceReadModelService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.segment_meta.clear(),
      db.segment_quality_snapshots.clear(),
      db.scope_stats_snapshots.clear(),
      db.speaker_profile_snapshots.clear(),
      db.translation_status_snapshots.clear(),
      db.language_asset_overviews.clear(),
      db.ai_task_snapshots.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.user_notes.clear(),
      db.speakers.clear(),
      db.languages.clear(),
      db.language_display_names.clear(),
      db.language_aliases.clear(),
      db.orthographies.clear(),
      db.orthography_bridges.clear(),
      db.ai_tasks.clear(),
    ]);
  });

  it('materializes quality, scope, speaker, and translation snapshots for a text', async () => {
    const rxDb = await getDb();
    await rxDb.collections.layers.bulkInsert([
      makeLayer({ id: 'layer-seg', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'layer-trn', layerType: 'translation', parentLayerId: 'layer-seg', constraint: 'symbolic_association', languageId: 'zho' }),
    ]);

    await db.speakers.put(makeSpeaker('spk-1', 'Alice'));
    await db.layer_units.bulkPut([
      makeUnit({ id: 'utt-1', layerId: 'layer-seg', unitType: 'unit', startTime: 0, endTime: 1, speakerId: 'spk-1', selfCertainty: 'certain', status: 'verified' }),
      makeUnit({ id: 'utt-2', layerId: 'layer-seg', unitType: 'unit', startTime: 1, endTime: 2, status: 'raw' }),
      makeUnit({ id: 'seg-1', layerId: 'layer-seg', unitType: 'segment', parentUnitId: 'utt-1', rootUnitId: 'utt-1', startTime: 0, endTime: 1, status: 'verified' }),
      makeUnit({ id: 'seg-2', layerId: 'layer-seg', unitType: 'segment', parentUnitId: 'utt-2', rootUnitId: 'utt-2', startTime: 1, endTime: 2, status: 'raw' }),
      makeUnit({ id: 'trl-1', layerId: 'layer-trn', unitType: 'segment', parentUnitId: 'utt-1', rootUnitId: 'utt-1', startTime: 0, endTime: 1, status: 'translated' }),
      makeUnit({ id: 'trl-2', layerId: 'layer-trn', unitType: 'segment', parentUnitId: 'utt-2', rootUnitId: 'utt-2', startTime: 1, endTime: 2, status: 'raw' }),
    ]);
    await db.layer_unit_contents.bulkPut([
      makeContent({ id: 'content-utt-1', unitId: 'utt-1', layerId: 'layer-seg', text: 'host one' }),
      makeContent({ id: 'content-utt-2', unitId: 'utt-2', layerId: 'layer-seg', text: '' }),
      makeContent({ id: 'content-seg-1', unitId: 'seg-1', layerId: 'layer-seg', text: 'hello world', ai_metadata: { confidence: 0.9 } }),
      makeContent({ id: 'content-seg-2', unitId: 'seg-2', layerId: 'layer-seg', text: '' }),
      makeContent({ id: 'content-trl-1', unitId: 'trl-1', layerId: 'layer-trn', contentRole: 'translation', text: '你好', isVerified: true }),
      makeContent({ id: 'content-trl-2', unitId: 'trl-2', layerId: 'layer-trn', contentRole: 'translation', text: '' }),
    ]);
    await db.user_notes.put(makeNote('note-1', 'utt-2', 'todo'));

    await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');
    await SegmentMetaService.rebuildForLayerMedia('layer-trn', 'media-1');
    await WorkspaceReadModelService.rebuildForText('text-1');

    const qualityRow = await db.segment_quality_snapshots.get('layer-seg::seg-2');
    const layerScope = await db.scope_stats_snapshots.get('layer::layer-seg');
    const speakerProfile = await db.speaker_profile_snapshots.get('speaker::spk-1::text-1');
    const translationStatus = await db.translation_status_snapshots.get('layer-trn::trl-2');

    expect(qualityRow).toMatchObject({
      segmentId: 'seg-2',
      severity: 'critical',
      missingSpeaker: true,
      emptyText: true,
    });
    expect(layerScope).toMatchObject({
      scopeType: 'layer',
      scopeKey: 'layer-seg',
      unitCount: 4,
      missingSpeakerCount: 2,
      untranscribedCount: 2,
      translationLayerCount: 1,
    });
    expect(speakerProfile).toMatchObject({
      speakerId: 'spk-1',
      speakerName: 'Alice',
    });
    expect(translationStatus).toMatchObject({
      unitId: 'trl-2',
      layerId: 'layer-trn',
      status: 'missing',
      hasText: false,
    });
  });

  it('materializes language asset and AI task overview tables', async () => {
    await db.languages.put(makeLanguage('hak', 'Hakka'));
    await db.language_display_names.put(makeDisplayName('disp-1', 'hak', '客家话'));
    await db.language_aliases.bulkPut([
      makeAlias('alias-1', 'hak', 'Hakka'),
      makeAlias('alias-2', 'hak', 'Kejia'),
    ]);
    await db.orthographies.bulkPut([
      makeOrthography('ortho-1', 'hak'),
      makeOrthography('ortho-2', 'hak'),
    ]);
    await db.orthography_bridges.put(makeBridge('bridge-1', 'ortho-1', 'ortho-2'));
    await db.ai_tasks.put(makeAiTask('task-1'));

    await WorkspaceReadModelService.rebuildLanguageAssetOverview();
    await WorkspaceReadModelService.rebuildAiTaskSnapshots();

    const languageOverview = await db.language_asset_overviews.get('hak');
    const taskOverview = await db.ai_task_snapshots.get('task-1');

    expect(languageOverview).toMatchObject({
      languageId: 'hak',
      displayName: '客家话',
      aliasCount: 2,
      orthographyCount: 2,
      bridgeCount: 1,
    });
    expect(taskOverview).toMatchObject({
      taskId: 'task-1',
      taskType: 'translate',
      status: 'done',
      isTerminal: true,
      hasError: false,
    });
    expect((taskOverview?.durationMs ?? 0) > 0).toBe(true);
  });

  it('falls back to the canonical language name when no preferred display name exists', async () => {
    await db.languages.put(makeLanguage('nan', 'Southern Min'));

    await WorkspaceReadModelService.rebuildLanguageAssetOverview();

    const languageOverview = await db.language_asset_overviews.get('nan');
    expect(languageOverview).toMatchObject({
      languageId: 'nan',
      displayName: 'Southern Min',
    });
  });
});
