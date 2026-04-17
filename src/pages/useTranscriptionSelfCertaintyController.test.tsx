// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTranscriptionSelfCertaintyController } from './useTranscriptionSelfCertaintyController';

describe('useTranscriptionSelfCertaintyController', () => {
  it('resolves duplicate segment ids by layer scope', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-a', [{ id: 'seg-1', layerId: 'layer-a', unitId: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 }]],
        ['layer-b', [{ id: 'seg-1', layerId: 'layer-b', unitId: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'layer-a', parentUnitId: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 },
        { id: 'seg-1', layerId: 'layer-b', parentUnitId: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 },
      ],
      units: [
        { id: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 },
        { id: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'certain', 'layer-a');
    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'layer-b');

    expect(saveUnitSelfCertainty).toHaveBeenNthCalledWith(1, ['seg-1'], 'certain');
    expect(saveUnitSelfCertainty).toHaveBeenNthCalledWith(2, ['seg-1'], 'uncertain');
  });

  it('resolves display certainty with the same layer-scoped path used by note badges', () => {
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-a', [{ id: 'seg-1', layerId: 'layer-a', unitId: 'utt-a', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
        ['layer-b', [{ id: 'seg-1', layerId: 'layer-b', unitId: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'layer-a', parentUnitId: 'utt-a', mediaId: 'media-1', startTime: 1, endTime: 2 },
        { id: 'seg-1', layerId: 'layer-b', parentUnitId: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      units: [
        { id: 'utt-a', mediaId: 'media-1', startTime: 1, endTime: 2 },
        { id: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
      ],
      saveUnitSelfCertainty: vi.fn(),
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-a')).toBeUndefined();
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-b')).toBe('certain');
  });

  it('falls back to any known segment hint when the UI passes a display lane id instead of the source layer', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['source-layer', [{ id: 'seg-1', layerId: 'source-layer', unitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'source-layer', parentUnitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      units: [
        { id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBe('certain');

    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'display-layer');

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-1'], 'uncertain');
  });

  it('marks fallback as ambiguous when duplicate source-layer hints map to multiple hosts', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['source-layer-a', [{ id: 'seg-1', layerId: 'source-layer-a', unitId: 'utt-a', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
        ['source-layer-b', [{ id: 'seg-1', layerId: 'source-layer-b', unitId: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'source-layer-a', parentUnitId: 'utt-a', mediaId: 'media-1', startTime: 1, endTime: 2 },
        { id: 'seg-1', layerId: 'source-layer-b', parentUnitId: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      units: [
        { id: 'utt-a', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
        { id: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBeUndefined();
    expect(result.current.resolveSelfCertaintyAmbiguityForUnit('seg-1', 'display-layer')).toBe(true);

    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'display-layer');

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-1'], 'uncertain');
  });

  it('falls back to other known hosts when the exact layer hint exists but cannot resolve any host', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['display-layer', [{ id: 'seg-1', layerId: 'display-layer', mediaId: 'media-1', startTime: 30, endTime: 31 }]],
        ['source-layer', [{ id: 'seg-1', layerId: 'source-layer', unitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'display-layer', mediaId: 'media-1', startTime: 30, endTime: 31 },
        { id: 'seg-1', layerId: 'source-layer', parentUnitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      units: [
        { id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBe('certain');
    expect(result.current.resolveSelfCertaintyAmbiguityForUnit('seg-1', 'display-layer')).toBe(false);

    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'display-layer');

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-1'], 'uncertain');
  });

  it('treats multiple scoped overlap hosts as ambiguous even when one host is certainty-bearing', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-a', [{ id: 'seg-1', layerId: 'layer-a', mediaId: 'media-1', startTime: 44.3, endTime: 62.3 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'layer-a', mediaId: 'media-1', startTime: 44.3, endTime: 62.3 },
      ],
      units: [
        { id: 'utt-nested', mediaId: 'media-1', startTime: 44.3, endTime: 62.3 },
        { id: 'utt-host', mediaId: 'media-1', startTime: 44.0, endTime: 62.5, selfCertainty: 'certain' },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-a')).toBeUndefined();
    expect(result.current.resolveSelfCertaintyAmbiguityForUnit('seg-1', 'layer-a')).toBe(true);

    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'layer-a');

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-1'], 'uncertain');
  });

  it('uses the segment unit itself as the certainty host in segment-only projects', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-seg', [{ id: 'seg-only-1', layerId: 'layer-seg', mediaId: 'media-1', startTime: 12, endTime: 18, selfCertainty: 'certain' }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-only-1', layerId: 'layer-seg', mediaId: 'media-1', startTime: 12, endTime: 18, selfCertainty: 'certain' },
      ],
      units: [],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-only-1', 'layer-seg')).toBe('certain');

    result.current.handleSetUnitSelfCertaintyFromMenu(['seg-only-1'], 'segment', 'uncertain', 'layer-seg');

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-only-1'], 'uncertain');
  });

  it('shows certainty only on the current segment when related segments share one host unit', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-seg', [
          { id: 'seg-1', layerId: 'layer-seg', unitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 },
          { id: 'seg-2', layerId: 'layer-seg', unitId: 'utt-host', mediaId: 'media-1', startTime: 2, endTime: 3 },
        ]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'layer-seg', parentUnitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 },
        { id: 'seg-2', layerId: 'layer-seg', parentUnitId: 'utt-host', mediaId: 'media-1', startTime: 2, endTime: 3 },
      ],
      units: [
        { id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 3 },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'certain', 'layer-seg');
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-1'], 'certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-2', 'layer-seg')).toBeUndefined();
  });

  it('optimistically mirrors a segment certainty edit to related scoped rows before refresh', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['source-layer', [{ id: 'seg-1', layerId: 'source-layer', unitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-1', layerId: 'display-layer', mediaId: 'media-1', startTime: 1, endTime: 2 },
        { id: 'seg-1', layerId: 'source-layer', parentUnitId: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      units: [
        { id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'uncertain', 'display-layer');
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['seg-1'], 'uncertain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBe('uncertain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'source-layer')).toBe('uncertain');
  });

  it('does not leak certainty across layers when duplicate segment ids exist', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() => useTranscriptionSelfCertaintyController({
      segmentsByLayer: new Map([
        ['layer-a', [{ id: 'seg-dup', layerId: 'layer-a', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' }]],
        ['layer-b', [{ id: 'seg-dup', layerId: 'layer-b', mediaId: 'media-1', startTime: 1, endTime: 2 }]],
      ]),
      currentMediaUnits: [
        { id: 'seg-dup', layerId: 'layer-a', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
        { id: 'seg-dup', layerId: 'layer-b', mediaId: 'media-1', startTime: 1, endTime: 2 },
      ],
      units: [],
      saveUnitSelfCertainty: saveUnitSelfCertainty,
    }));

    expect(result.current.resolveSelfCertaintyForUnit('seg-dup', 'layer-a')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-dup', 'layer-b')).toBeUndefined();
  });
});
