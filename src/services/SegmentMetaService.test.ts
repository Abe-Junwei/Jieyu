import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LayerUnitContentDocType, type LayerUnitDocType, type SegmentMetaDocType, type SpeakerDocType, type UserNoteDocType } from '../db';
import { SegmentMetaService } from './SegmentMetaService';

const NOW = '2026-04-16T00:00:00.000Z';

function makeSpeaker(id: string, name: string): SpeakerDocType {
  return {
    id,
    name,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeUnitUnit(id: string, layerId: string): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    unitType: 'unit',
    startTime: 0,
    endTime: 2,
    speakerId: 'spk-1',
    selfCertainty: 'certain',
    status: 'verified',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeSegmentUnit(id: string, layerId: string, parentUnitId: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    unitType: 'segment',
    parentUnitId,
    rootUnitId: parentUnitId,
    startTime,
    endTime,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeContent(id: string, unitId: string, layerId: string, text: string): LayerUnitContentDocType {
  return {
    id,
    textId: 'text-1',
    unitId,
    layerId,
    contentRole: 'primary_text',
    modality: 'text',
    text,
    sourceType: 'human',
    ai_metadata: { confidence: 0.81 },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeNote(id: string, targetId: string, category: UserNoteDocType['category']): UserNoteDocType {
  return {
    id,
    targetType: 'unit',
    targetId,
    content: { 'zh-CN': '待确认' },
    ...(category ? { category } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeTierAnnotationNote(id: string, targetId: string, category: UserNoteDocType['category']): UserNoteDocType {
  return {
    id,
    targetType: 'tier_annotation',
    targetId,
    content: { 'zh-CN': '层级备注' },
    ...(category ? { category } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('SegmentMetaService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.segment_meta.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.user_notes.clear(),
      db.speakers.clear(),
    ]);
  });

  it('rebuilds unified segment meta rows from canonical layer-unit sources', async () => {
    await db.speakers.put(makeSpeaker('spk-1', 'Alice'));
    await db.layer_units.bulkPut([
      makeUnitUnit('utt-1', 'layer-utt'),
      makeSegmentUnit('seg-1', 'layer-seg', 'utt-1', 0, 1),
    ]);
    await db.layer_unit_contents.put(makeContent('content-1', 'seg-1', 'layer-seg', 'hello world'));
    await db.user_notes.put(makeNote('note-1', 'utt-1', 'todo'));

    const rows = await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      segmentId: 'seg-1',
      layerId: 'layer-seg',
      hostUnitId: 'utt-1',
      effectiveSpeakerId: 'spk-1',
      effectiveSpeakerName: 'Alice',
      noteCategoryKeys: ['todo'],
      text: 'hello world',
      hasText: true,
    });
    // 段行自身无 per-layer 字段时，不得把宿主 unit 的值投影进 segment_meta（串层污染根因）。
    expect(rows[0]?.effectiveSelfCertainty).toBeUndefined();
    expect(rows[0]?.annotationStatus).toBeUndefined();
  });

  it('projects selfCertainty and status only from the segment row, not from the shared host', async () => {
    await db.speakers.put(makeSpeaker('spk-1', 'Alice'));
    await db.layer_units.bulkPut([
      { ...makeUnitUnit('utt-1', 'layer-utt'), selfCertainty: 'certain', status: 'verified' },
      {
        ...makeSegmentUnit('seg-1', 'layer-seg', 'utt-1', 0, 1),
        selfCertainty: 'uncertain',
        status: 'transcribed',
      },
    ]);
    await db.layer_unit_contents.put(makeContent('content-1', 'seg-1', 'layer-seg', 'hello'));

    const rows = await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      effectiveSelfCertainty: 'uncertain',
      annotationStatus: 'transcribed',
    });
  });

  it('keeps distinct rows when multiple layers reuse the same source segment id', async () => {
    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'seg-shared',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-a',
        startTime: 0,
        endTime: 1,
        text: 'layer A text',
      },
      {
        segmentId: 'seg-shared',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-b',
        startTime: 0,
        endTime: 1,
        text: 'layer B text',
      },
    ]);

    const [layerARows, layerBRows] = await Promise.all([
      SegmentMetaService.listByLayerMedia('layer-a', 'media-1'),
      SegmentMetaService.listByLayerMedia('layer-b', 'media-1'),
    ]);

    expect(layerARows).toHaveLength(1);
    expect(layerBRows).toHaveLength(1);
    expect(layerARows[0]?.text).toBe('layer A text');
    expect(layerBRows[0]?.text).toBe('layer B text');
  });

  it('rebuilds unified rows for unit-backed layers as well as segment-backed layers', async () => {
    await db.speakers.put(makeSpeaker('spk-1', 'Alice'));
    await db.layer_units.put(makeUnitUnit('utt-standalone', 'layer-plain'));
    await db.layer_unit_contents.put(makeContent('content-plain', 'utt-standalone', 'layer-plain', 'plain unit'));
    await db.user_notes.put(makeNote('note-plain', 'utt-standalone', 'question'));

    const rows = await SegmentMetaService.rebuildForLayerMedia('layer-plain', 'media-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      segmentId: 'utt-standalone',
      unitKind: 'unit',
      layerId: 'layer-plain',
      hostUnitId: 'utt-standalone',
      noteCategoryKeys: ['question'],
      text: 'plain unit',
    });
  });

  it('refreshes affected layer-media scopes after metadata mutations', async () => {
    await db.speakers.bulkPut([makeSpeaker('spk-1', 'Alice'), makeSpeaker('spk-2', 'Beatrice')]);
    await db.layer_units.bulkPut([
      makeUnitUnit('utt-1', 'layer-utt'),
      makeSegmentUnit('seg-1', 'layer-seg', 'utt-1', 0, 1),
    ]);
    await db.layer_unit_contents.put(makeContent('content-1', 'seg-1', 'layer-seg', 'hello world'));
    await db.user_notes.put(makeNote('note-1', 'utt-1', 'todo'));

    await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');

    await db.layer_units.update('utt-1', {
      speakerId: 'spk-2',
      selfCertainty: 'uncertain',
      updatedAt: '2026-04-16T00:00:01.000Z',
    });
    await db.user_notes.put(makeNote('note-2', 'seg-1', 'comment'));

    await SegmentMetaService.syncForUnitIds(['seg-1', 'utt-1']);

    const rows = await SegmentMetaService.listByLayerMedia('layer-seg', 'media-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      effectiveSpeakerId: 'spk-2',
      effectiveSpeakerName: 'Beatrice',
      noteCategoryKeys: ['todo', 'comment'],
    });
    // 宿主 unit 的 selfCertainty 变更不再「泄漏」到未自带该字段的段行 meta 投影。
    expect(rows[0]?.effectiveSelfCertainty).toBeUndefined();
  });

  it('refreshes dependent layer scopes when host unit metadata changes', async () => {
    await db.speakers.bulkPut([makeSpeaker('spk-1', 'Alice'), makeSpeaker('spk-2', 'Beatrice')]);
    await db.layer_units.bulkPut([
      makeUnitUnit('utt-host', 'layer-utt'),
      makeSegmentUnit('seg-host', 'layer-seg', 'utt-host', 0, 1),
      makeSegmentUnit('seg-trn', 'layer-trn', 'utt-host', 0, 1),
    ]);
    await db.layer_unit_contents.bulkPut([
      makeContent('content-host', 'seg-host', 'layer-seg', 'source line'),
      makeContent('content-trn', 'seg-trn', 'layer-trn', 'translation line'),
    ]);

    await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');
    await SegmentMetaService.rebuildForLayerMedia('layer-trn', 'media-1');

    await db.layer_units.update('utt-host', {
      speakerId: 'spk-2',
      updatedAt: '2026-04-16T00:00:01.000Z',
    });
    await db.user_notes.put(makeNote('note-host', 'utt-host', 'todo'));

    await SegmentMetaService.syncForUnitIds(['utt-host']);

    const translationRows = await SegmentMetaService.listByLayerMedia('layer-trn', 'media-1');
    expect(translationRows).toHaveLength(1);
    expect(translationRows[0]).toMatchObject({
      effectiveSpeakerId: 'spk-2',
      effectiveSpeakerName: 'Beatrice',
      noteCategoryKeys: ['todo'],
    });
  });

  it('captures tier-annotation notes into noteCategoryKeys for the scoped segment row', async () => {
    await db.speakers.put(makeSpeaker('spk-1', 'Alice'));
    await db.layer_units.bulkPut([
      makeUnitUnit('utt-tier', 'layer-utt'),
      makeSegmentUnit('seg-tier', 'layer-seg', 'utt-tier', 0, 1),
    ]);
    await db.layer_unit_contents.put(makeContent('content-tier', 'seg-tier', 'layer-seg', 'hello tier note'));
    await db.user_notes.put(makeTierAnnotationNote('note-tier', 'seg-tier::layer-seg', 'fieldwork'));

    const rows = await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      segmentId: 'seg-tier',
      noteCategoryKeys: ['fieldwork'],
    });
  });

  it('drops stale segment rows when sync runs after a unit was deleted', async () => {
    await db.layer_units.bulkPut([
      makeUnitUnit('utt-delete', 'layer-seg'),
      makeSegmentUnit('seg-delete', 'layer-seg', 'utt-delete', 0, 1),
    ]);
    await db.layer_unit_contents.put(makeContent('content-delete', 'seg-delete', 'layer-seg', 'to remove'));

    await SegmentMetaService.rebuildForLayerMedia('layer-seg', 'media-1');

    await db.layer_unit_contents.delete('content-delete');
    await db.layer_units.delete('seg-delete');

    await SegmentMetaService.syncForUnitIds(['seg-delete']);

    const rows = await SegmentMetaService.listByLayerMedia('layer-seg', 'media-1');
    expect(rows.map((row) => row.segmentId)).not.toContain('seg-delete');
  });

  it('supports AI-style metadata filtering over the unified segment meta table', async () => {
    const docs: SegmentMetaDocType[] = [
      {
        id: 'seg-1',
        segmentId: 'seg-1',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-seg',
        hostUnitId: 'utt-1',
        startTime: 0,
        endTime: 1,
        text: 'hello morphology',
        normalizedText: 'hello morphology',
        effectiveSpeakerId: 'spk-1',
        effectiveSpeakerName: 'Alice',
        noteCategoryKeys: ['todo'],
        effectiveSelfCertainty: 'certain',
        annotationStatus: 'verified',
        aiConfidence: 0.91,
        sourceType: 'human',
        hasText: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg-2',
        segmentId: 'seg-2',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'layer-seg',
        hostUnitId: 'utt-2',
        startTime: 1,
        endTime: 2,
        text: 'other line',
        normalizedText: 'other line',
        effectiveSpeakerId: 'spk-2',
        effectiveSpeakerName: 'Bob',
        noteCategoryKeys: ['comment'],
        effectiveSelfCertainty: 'uncertain',
        annotationStatus: 'transcribed',
        aiConfidence: 0.42,
        sourceType: 'human',
        hasText: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    await db.segment_meta.bulkPut(docs);

    const rows = await SegmentMetaService.searchSegmentMeta({
      layerId: 'layer-seg',
      mediaId: 'media-1',
      speakerId: 'spk-1',
      noteCategory: 'todo',
      selfCertainty: 'certain',
      query: 'morphology',
    });

    expect(rows.map((row) => row.segmentId)).toEqual(['seg-1']);
  });
});
