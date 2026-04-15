import { describe, expect, it } from 'vitest';
import type { LayerSegmentDocType, UtteranceDocType } from '../db';
import { buildTimelineUnitViewIndex, mergedTimelineUnitSemanticKeyCount } from './timelineUnitView';

function seg(
  id: string,
  layerId: string,
  mediaId: string,
  start: number,
  end: number,
  utteranceId?: string,
): LayerSegmentDocType {
  return {
    id,
    textId: 't1',
    mediaId,
    layerId,
    startTime: start,
    endTime: end,
    ...(utteranceId ? { utteranceId } : {}),
    createdAt: '',
    updatedAt: '',
  };
}

describe('buildTimelineUnitViewIndex', () => {
  it('uses segments when project has no utterances', () => {
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1), seg('s2', 'layer-a', 'm1', 1, 2)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
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

  it('builds merged project units when both utterances and segments exist', () => {
    const u: UtteranceDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'hi' },
    };
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [u],
      utterancesOnCurrentMedia: [u],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-main',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.fallbackToSegments).toBe(false);
    expect(index.allUnits).toHaveLength(2);
    expect(index.allUnits.some((unit) => unit.kind === 'utterance')).toBe(true);
    expect(index.allUnits.some((unit) => unit.kind === 'segment')).toBe(true);
    expect(index.totalCount).toBe(2);
    expect(index.byLayer.get('layer-a')?.length).toBe(1);
    expect(index.byLayer.get('layer-main')?.length).toBe(1);
    expect(index.currentMediaUnits[0]!.text).toBe('hi');
  });

  it('indexes current-media segment ids in byId when project is utterance-first but track has no utterances', () => {
    const u: UtteranceDocType = {
      id: 'u-remote',
      textId: 't0',
      mediaId: 'm2',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'remote' },
    };
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [u],
      utterancesOnCurrentMedia: [],
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

  it('lets segment rows shadow utterance rows by parent utterance id', () => {
    const u: UtteranceDocType = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      startTime: 0,
      endTime: 1,
      createdAt: '',
      updatedAt: '',
      transcription: { default: 'utterance text' },
    };
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1, 'u1')]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [u],
      utterancesOnCurrentMedia: [u],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits).toHaveLength(1);
    expect(index.allUnits[0]!.id).toBe('s1');
    expect(index.allUnits[0]!.kind).toBe('segment');
    expect(index.byId.get('u1')?.id).toBe('s1');
    expect(index.getReferringUnits('u1').map((unit) => unit.id)).toEqual(['s1']);
  });

  it('resolves segment text from preferred layer', () => {
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
      ['layer-b', [seg('s1', 'layer-b', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-a', new Map([['s1', { text: 'text-from-a' }]])],
      ['layer-b', new Map([['s1', { text: 'text-from-b' }]])],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
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
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-a', new Map([['s1', { text: 'fallback-text' }]])],
      ['layer-b', new Map<string, { text?: string }>()],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-b',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('fallback-text');
  });

  it('resolves segment text as empty when no content exists', () => {
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('');
  });

  it('resolves segment text trimming whitespace', () => {
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-a', new Map([['s1', { text: '  hello  ' }]])],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
      segmentsByLayer,
      segmentContentByLayer,
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
    });
    expect(index.allUnits[0]!.text).toBe('hello');
  });

  it('skips blank preferred layer text and falls back to next layer', () => {
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [seg('s1', 'layer-a', 'm1', 0, 1)]],
    ]);
    const segmentContentByLayer = new Map([
      ['layer-preferred', new Map([['s1', { text: '   ' }]])],
      ['layer-a', new Map([['s1', { text: 'real text' }]])],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
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
    const segmentsByLayer = new Map<string, LayerSegmentDocType[]>([
      ['layer-a', [shared]],
      ['layer-b', [{ ...shared, layerId: 'layer-b' }]],
    ]);
    const index = buildTimelineUnitViewIndex({
      utterances: [],
      utterancesOnCurrentMedia: [],
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
      utterances: [],
      utterancesOnCurrentMedia: [],
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
      utterances: [],
      utterancesOnCurrentMedia: [],
      segmentsByLayer: new Map(),
      segmentContentByLayer: new Map(),
      currentMediaId: 'm1',
      activeLayerIdForEdits: 'layer-a',
      defaultTranscriptionLayerId: 'layer-main',
      epoch: 42,
    });
    expect(index.epoch).toBe(42);
  });
});

describe('mergedTimelineUnitSemanticKeyCount', () => {
  it('shadows utterance with referring segment by parent id', () => {
    expect(mergedTimelineUnitSemanticKeyCount({
      utteranceIds: ['u1'],
      segments: [{ id: 's1', utteranceId: 'u1' }],
    })).toBe(1);
  });

  it('counts independent segment plus utterance separately', () => {
    expect(mergedTimelineUnitSemanticKeyCount({
      utteranceIds: ['u1'],
      segments: [{ id: 's1' }],
    })).toBe(2);
  });
});
