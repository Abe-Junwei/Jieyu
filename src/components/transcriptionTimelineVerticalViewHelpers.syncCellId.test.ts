import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType } from '../db';
import type { VerticalReadingGroup } from '../utils/transcriptionVerticalReadingGroups';
import { resolvePairedReadingSyncedTargetCellId } from './transcriptionTimelineVerticalViewHelpers';

function layerTr(id: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't1',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    constraint: 'independent_boundary',
  } as LayerDocType;
}

function layerTl(id: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't1',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'en',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'translation',
    constraint: 'symbolic_association',
  } as LayerDocType;
}

function stubContent(id: string, text: string): LayerUnitContentDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return { id, text, createdAt: now, updatedAt: now };
}

function unitSeg(id: string, layerId: string, start: number, end: number): LayerUnitDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    layerId,
    unitType: 'segment',
    startTime: start,
    endTime: end,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('resolvePairedReadingSyncedTargetCellId', () => {
  it('uses first explicit segment id when multi translation layers make group.targetItems stale', () => {
    const tr = layerTr('tr-host');
    const tlA = layerTl('tl-a');
    const tlB = layerTl('tl-b');
    tlA.constraint = 'independent_boundary';
    tlB.constraint = 'independent_boundary';
    const uHost = { ...unitSeg('u1', tr.id, 0, 10), unitType: 'unit' } as LayerUnitDocType;
    const segA = unitSeg('sa', tlA.id, 0, 5);
    const segB = unitSeg('sb', tlA.id, 5, 10);
    const segC = unitSeg('sc', tlA.id, 0, 10);
    const group: VerticalReadingGroup = {
      id: 'pr-u1',
      startTime: 0,
      endTime: 10,
      sourceItems: [{ unitId: 'u1', text: 'x', startTime: 0, endTime: 10, layerId: tr.id }],
      targetItems: [{ id: 'u1:target:0', text: 'one-line-model', anchorUnitIds: ['u1'] }],
      speakerSummary: '',
      primaryAnchorUnitId: 'u1',
      primaryAnchorLayerId: tr.id,
      editingTargetPolicy: 'group-target',
      isMultiAnchorGroup: false,
    };
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      [tlA.id, [segA, segB, segC]],
    ]);
    const content = new Map<string, LayerUnitContentDocType>([
      [segA.id, stubContent(`${segA.id}-doc`, 'a')],
      [segB.id, stubContent(`${segB.id}-doc`, 'b')],
      [segC.id, stubContent(`${segC.id}-doc`, 'c')],
    ]);
    const segmentContentByLayer = new Map([[tlA.id, content]]);
    const translationTextByLayer = new Map<string, Map<string, LayerUnitContentDocType>>();
    const unitByIdForSpeaker = new Map<string, LayerUnitDocType>([['u1', uHost]]);

    const cellId = resolvePairedReadingSyncedTargetCellId({
      group,
      syncTranslationLayer: tlA,
      translationLayers: [tlA, tlB],
      transcriptionLayers: [tr],
      targetLayer: tlA,
      sourceLayer: tr,
      defaultTranscriptionLayerId: tr.id,
      layerLinks: [],
      segmentsByLayer,
      segmentContentByLayer,
      translationTextByLayer,
      unitByIdForSpeaker,
    });
    expect(cellId).toBe(`target:${group.id}:${tlA.id}:u1:target:seg:${segA.id}`);
  });

  it('uses merged editor suffix when only one target row is shown', () => {
    const tr = layerTr('tr-host');
    const tlA = layerTl('tl-a');
    const group: VerticalReadingGroup = {
      id: 'pr-u1',
      startTime: 0,
      endTime: 1,
      sourceItems: [{ unitId: 'u1', text: 'x', startTime: 0, endTime: 1, layerId: tr.id }],
      targetItems: [{ id: 'u1:target:0', text: 'only', anchorUnitIds: ['u1'] }],
      speakerSummary: '',
      primaryAnchorUnitId: 'u1',
      primaryAnchorLayerId: tr.id,
      editingTargetPolicy: 'group-target',
      isMultiAnchorGroup: false,
    };
    const uHost = { ...unitSeg('u1', tr.id, 0, 1), unitType: 'unit' } as LayerUnitDocType;
    const segOne = unitSeg('s1', tlA.id, 0, 1);
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([[tlA.id, [segOne]]]);
    const segmentContentByLayer = new Map([[tlA.id, new Map<string, LayerUnitContentDocType>([[segOne.id, stubContent(`${segOne.id}-doc`, 't')]])]]);
    const translationTextByLayer = new Map<string, Map<string, LayerUnitContentDocType>>();
    const unitByIdForSpeaker = new Map<string, LayerUnitDocType>([['u1', uHost]]);

    const cellId = resolvePairedReadingSyncedTargetCellId({
      group,
      syncTranslationLayer: tlA,
      translationLayers: [tlA],
      transcriptionLayers: [tr],
      targetLayer: tlA,
      sourceLayer: tr,
      defaultTranscriptionLayerId: tr.id,
      layerLinks: [],
      segmentsByLayer,
      segmentContentByLayer,
      translationTextByLayer,
      unitByIdForSpeaker,
    });
    expect(cellId).toBe(`target:${group.id}:${tlA.id}:editor`);
  });
});
