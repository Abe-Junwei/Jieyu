import { describe, expect, it } from 'vitest';
import {
  resolveTranscriptionTargetLayerId,
  resolveTranscriptionSelectionAnchor,
  resolveTranscriptionUnitKind,
  resolveTranscriptionUnitTarget,
} from './transcriptionUnitTargetResolver';

describe('transcriptionUnitTargetResolver', () => {
  it('forces independent layers to segment kind', () => {
    expect(resolveTranscriptionUnitKind({
      layerId: 'layer-seg',
      preferredKind: 'utterance',
      independentLayerIds: new Set(['layer-seg']),
    })).toBe('segment');
  });

  it('keeps preferred kind for non-independent layers', () => {
    expect(resolveTranscriptionUnitKind({
      layerId: 'layer-main',
      preferredKind: 'utterance',
      independentLayerIds: new Set(['layer-seg']),
    })).toBe('utterance');
  });

  it('resolves edit layer fallback in selected -> focused -> unit -> default -> first order', () => {
    expect(resolveTranscriptionTargetLayerId({
      selectedLayerId: 'layer-selected',
      focusedLayerId: 'layer-focused',
      selectedTimelineUnitLayerId: 'layer-unit',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-selected');

    expect(resolveTranscriptionTargetLayerId({
      selectedLayerId: '  ',
      focusedLayerId: 'layer-focused',
      selectedTimelineUnitLayerId: 'layer-unit',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-focused');

    expect(resolveTranscriptionTargetLayerId({
      selectedLayerId: '',
      focusedLayerId: '',
      selectedTimelineUnitLayerId: ' layer-unit ',
      defaultTranscriptionLayerId: 'layer-default',
      firstTranscriptionLayerId: 'layer-first',
    })).toBe('layer-unit');
  });

  it('creates timeline unit targets with resolved kind', () => {
    expect(resolveTranscriptionUnitTarget({
      layerId: 'layer-seg',
      unitId: 'seg-1',
      preferredKind: 'utterance',
      independentLayerIds: new Set(['layer-seg']),
    })).toEqual({ layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' });
  });

  it('resolves segment and utterance anchors by expected kind', () => {
    expect(resolveTranscriptionSelectionAnchor({
      expectedKind: 'segment',
      fallbackUnitId: 'seg-fallback',
      selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-selected', kind: 'segment' },
    })).toBe('seg-selected');

    expect(resolveTranscriptionSelectionAnchor({
      expectedKind: 'utterance',
      fallbackUnitId: 'utt-fallback',
      selectedTimelineUnit: { layerId: 'layer-main', unitId: 'seg-selected', kind: 'segment' },
    })).toBe('utt-fallback');
  });
});