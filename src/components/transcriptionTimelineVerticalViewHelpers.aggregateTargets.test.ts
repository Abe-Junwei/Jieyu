import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType } from '../db';
import { buildAggregatePairedReadingTargetItemsForSourceUnit } from './transcriptionTimelineVerticalViewHelpers';

function mkTr(id: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    constraint: 'symbolic_association',
  } as LayerDocType;
}

function tlSeg(id: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'en',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'translation',
    constraint: 'independent_boundary',
  } as LayerDocType;
}

function stubContent(id: string, text: string): LayerUnitContentDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return { id, text, createdAt: now, updatedAt: now };
}

function unit(id: string, layerId: string): LayerUnitDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    mediaId: 'm',
    layerId,
    startTime: 0,
    endTime: 10,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('buildAggregatePairedReadingTargetItemsForSourceUnit', () => {
  it('concatenates plain-text rows from each applicable translation layer in order', () => {
    const tr = mkTr('tr-host');
    const a = tlSeg('tl-a');
    const b = tlSeg('tl-b');
    const u = unit('u1', tr.id);
    const textMap = new Map<string, Map<string, LayerUnitContentDocType>>([
      [a.id, new Map([[u.id, stubContent(`${u.id}-a`, 'one')]])],
      [b.id, new Map([[u.id, stubContent(`${u.id}-b`, 'two')]])],
    ]);
    const items = buildAggregatePairedReadingTargetItemsForSourceUnit({
      unit: u,
      translationLayers: [a, b],
      transcriptionLayers: [tr],
      defaultTranscriptionLayerId: tr.id,
      layerLinks: [],
      segmentsByLayer: undefined,
      segmentContentByLayer: undefined,
      translationTextByLayer: textMap,
      unitByIdForSpeaker: new Map([[u.id, u]]),
      fallbackFocusedSourceLayerId: tr.id,
    });
    expect(items.map((x) => x.text)).toEqual(['one', 'two']);
    expect(items.every((x) => x.anchorUnitIds.length === 1 && x.anchorUnitIds[0] === u.id)).toBe(true);
  });

  it('appends explicit segment items across layers with stable suffixed ids', () => {
    const tr = mkTr('tr-host');
    const a = tlSeg('tl-a');
    const b = tlSeg('tl-b');
    const u = unit('u1', tr.id);
    const s1 = { ...unit('s1', a.id), unitType: 'segment' as const, startTime: 0, endTime: 5 };
    const s2 = { ...unit('s2', b.id), unitType: 'segment' as const, startTime: 0, endTime: 5 };
    const segByLayer = new Map<string, LayerUnitDocType[]>([
      [a.id, [s1]],
      [b.id, [s2]],
    ]);
    const content = new Map<string, Map<string, LayerUnitContentDocType>>([
      [a.id, new Map([[s1.id, stubContent(`${s1.id}-c`, 'A')]])],
      [b.id, new Map([[s2.id, stubContent(`${s2.id}-c`, 'B')]])],
    ]);
    const textMap = new Map<string, Map<string, LayerUnitContentDocType>>();
    const items = buildAggregatePairedReadingTargetItemsForSourceUnit({
      unit: u,
      translationLayers: [a, b],
      transcriptionLayers: [tr],
      defaultTranscriptionLayerId: tr.id,
      layerLinks: [],
      segmentsByLayer: segByLayer,
      segmentContentByLayer: content,
      translationTextByLayer: textMap,
      unitByIdForSpeaker: new Map([[u.id, u]]),
      fallbackFocusedSourceLayerId: tr.id,
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.text).toBe('A');
    expect(items[0]?.id).toBe(`u1:target:seg:${s1.id}:layer:${a.id}`);
    expect(items[1]?.text).toBe('B');
    expect(items[1]?.translationSegmentId).toBe(s2.id);
  });
});
