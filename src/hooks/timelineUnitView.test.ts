import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import { buildTimelineUnitViewIndex, mergedTimelineUnitSemanticKeyCount, pickTimelineUnitsForTranscriptionLayer } from './timelineUnitView';

function tr(id: string, constraint: LayerDocType['constraint'], parentLayerId?: string): LayerDocType {
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
    constraint,
    ...(parentLayerId ? { parentLayerId } : {}),
  } as LayerDocType;
}

function seg(
  id: string,
  layerId: string,
  mediaId: string,
  start: number,
  end: number,
  unitId?: string,
): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId,
    layerId,
    startTime: start,
    endTime: end,
    ...(unitId ? { unitId } : {}),
    createdAt: '',
    updatedAt: '',
  };
}

describe('buildTimelineUnitViewIndex', () => {
  it('uses segments when project has no units', () => {
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1), seg('s2', 'layer-a', 'm1', 1, 2)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.fallbackToSegments).toBe(true);
    expect(index.allUnits).toHaveLength(2);
    expect(index.totalCount).toBe(2);
    expect(index.currentMediaUnits).toHaveLength(2);
    expect(index.allUnits[0]!.kind).toBe('segment');
  });

  it('builds merged project units when both units and segments exist', () => {
    const u: LayerUnitDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'hi' },
    };
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [u],
      unitsOnCurrentMedia: [u],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-main',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.fallbackToSegments).toBe(false);
    expect(index.allUnits).toHaveLength(2);
    expect(index.allUnits.some((unit) => unit.kind === 'unit')).toBe(true);
    expect(index.allUnits.some((unit) => unit.kind === 'segment')).toBe(true);
    expect(index.totalCount).toBe(2);
    expect(index.byLayer.get('layer-a')?.length).toBe(1);
    expect(index.byLayer.get('layer-main')?.length).toBe(1);
    expect(index.currentMediaUnits[0]!.text).toBe('hi');
  });

  it('indexes current-media segment ids in byId when project is unit-first but track has no units', () => {
    const u: LayerUnitDocType = {
      id: 'u-remote',
      textId: 't0',
      mediaId: 'm2',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'remote' },
    };
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [u],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.fallbackToSegments).toBe(false);
    expect(index.allUnits).toHaveLength(2);
    expect(index.currentMediaUnits).toHaveLength(1);
    expect(index.currentMediaUnits[0]!.id).toBe('s1');
    expect(index.byId.get('u-remote')).toBeDefined();
    expect(index.byId.get('s1')).toBeDefined();
    expect(index.byId.get('s1')!.kind).toBe('segment');
  });

  it('keeps multiple independent segments on the same media when a canonical unit row still exists', () => {
    const host: LayerUnitDocType = {
      id: 'utt-host',
      textId: 't1',
      mediaId: 'm1',
      startTime: 0,
      endTime: 10,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'host' },
    };
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [
        seg('s1', 'layer-a', 'm1', 0, 2),
        seg('s2', 'layer-a', 'm1', 2, 4),
        seg('s3', 'layer-a', 'm1', 4, 6),
        seg('s4', 'layer-a', 'm1', 6, 8),
      ]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [host],
      unitsOnCurrentMedia: [host],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits).toHaveLength(5);
    const segmentIds = index.allUnits.filter((u) => u.kind === 'segment').map((u) => u.id).sort();
    expect(segmentIds).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('lets segment rows shadow unit rows by parent unit id', () => {
    const u: LayerUnitDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'unit text' },
    };
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1, 'u1')]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [u],
      unitsOnCurrentMedia: [u],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits).toHaveLength(1);
    expect(index.allUnits[0]!.id).toBe('s1');
    expect(index.allUnits[0]!.kind).toBe('segment');
    expect(index.byId.get('u1')).toBeUndefined();
    expect(index.resolveBySemanticId('u1')?.id).toBe('s1');
    expect(index.getReferringUnits('u1').map((unit) => unit.id)).toEqual(['s1']);
  });

  it('resolves segment text from preferred layer', () => {
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
      ['layer-b', [seg('s1', 'layer-b', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-a', new Map([['s1', { text: 'text-from-a' }]])],
      ['layer-b', new Map([['s1', { text: 'text-from-b' }]])],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-b',
      defaultTranscriptionLayerId: 'layer-main',
    });
    const unit = index.allUnits.find((u) => u.id === 's1');
    expect(unit?.text).toBe('text-from-b');
  });

  it('resolves segment text by fallback when preferred layer has no content', () => {
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-a', new Map([['s1', { text: 'fallback-text' }]])],
      ['layer-b', new Map<string, { text?: string }>()],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-b',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('fallback-text');
  });

  it('resolves segment text as empty when no content exists', () => {
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('');
  });

  it('resolves segment text trimming whitespace', () => {
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-a', new Map([['s1', { text: '  hello  ' }]])],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('hello');
  });

  it('skips blank preferred layer text and falls back to next layer', () => {
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-preferred', new Map([['s1', { text: '   ' }]])],
      ['layer-a', new Map([['s1', { text: 'real text' }]])],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-preferred',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('real text');
  });

  it('deduplicates segments that appear in multiple layers', () => {
    const shared = seg('s1', 'layer-a', 'm1', 0, 1);
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['layer-a', [shared]],
      ['layer-b', [{ ...shared, layerId: 'layer-b' }]],
    ]);
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits).toHaveLength(1);
  });

  it('marks index incomplete when segment loading is still in progress', () => {
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
      segmentsLoadComplete: false,
    });
    expect(index.isComplete).toBe(false);
    expect(index.allUnits).toHaveLength(0);
    expect(index.currentMediaUnits).toHaveLength(0);
  });

  it('keeps epoch from builder input', () => {
    const index = buildTimelineUnitViewIndex({
      units: [],
      unitsOnCurrentMedia: [],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
      epoch: 42,
    });
    expect(index.epoch).toBe(42);
  });

  it('enriches byLayer for dependent transcription lane when canonical units omit layerId (ADR 0020)', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const u: LayerUnitDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'x' },
    };
    const index = buildTimelineUnitViewIndex({
      units: [u],
      unitsOnCurrentMedia: [u],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: parent.id,
      defaultTranscriptionLayerId: parent.id,
      transcriptionLaneReadScope: {
        transcriptionLayers: [parent, dep],
        allLayersOrdered: [parent, dep],
      },
    });
    const depBucket = index.byLayer.get(dep.id);
    expect(depBucket?.some((row) => row.id === 'u1' && row.kind === 'unit' && row.layerId === dep.id)).toBe(true);
    const picked = pickTimelineUnitsForTranscriptionLayer(index, dep.id);
    expect(picked.some((row) => row.id === 'u1')).toBe(true);
  });

  it('byLayer enrich uses layer_links when dependent transcription omits parentLayerId', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'independent_boundary');
    const u: LayerUnitDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'x' },
    };
    const index = buildTimelineUnitViewIndex({
      units: [u],
      unitsOnCurrentMedia: [u],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: parent.id,
      defaultTranscriptionLayerId: parent.id,
      transcriptionLaneReadScope: {
        transcriptionLayers: [parent, dep],
        allLayersOrdered: [parent, dep],
        layerLinks: [{
          layerId: 'tr-dep',
          transcriptionLayerKey: 'tr-parent',
          hostTranscriptionLayerId: 'tr-parent',
          isPreferred: true,
        }],
      },
    });
    expect(index.byLayer.get(dep.id)?.some((row) => row.id === 'u1' && row.layerId === dep.id)).toBe(true);
  });
});

describe('mergedTimelineUnitSemanticKeyCount', () => {
  it('shadows unit with referring segment by parent id', () => {
    expect(mergedTimelineUnitSemanticKeyCount({
      unitIds: ['u1'],
      segments: [{ id: 's1', unitId: 'u1' }],
    })).toBe(1);
  });

  it('counts independent segment plus unit separately', () => {
    expect(mergedTimelineUnitSemanticKeyCount({
      unitIds: ['u1'],
      segments: [{ id: 's1' }],
    })).toBe(2);
  });
});
