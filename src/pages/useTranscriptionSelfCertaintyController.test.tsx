// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import { useTranscriptionSelfCertaintyController } from './useTranscriptionSelfCertaintyController';

type ControllerInput = Parameters<typeof useTranscriptionSelfCertaintyController>[0];

function deferred<T = void>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function segmentRow(certainty: UnitSelfCertainty | undefined, layerId = 'layer-seg', id = 'seg-1') {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    startTime: 1,
    endTime: 2,
    ...(certainty ? { selfCertainty: certainty } : {}),
  };
}

function segmentInput(
  certainty: UnitSelfCertainty | undefined,
  saveUnitSelfCertainty: ControllerInput['saveUnitSelfCertainty'],
): ControllerInput {
  const row = segmentRow(certainty);
  return {
    segmentsByLayer: new Map([['layer-seg', [row]]]),
    currentMediaUnits: [row],
    units: [],
    saveUnitSelfCertainty,
  };
}

/*
 * ⚠️ Regression suite for the self-certainty cross-layer contamination bug.
 *   Previous iterations asserted writes landed on the (shared) canonical host unit
 *   — that was the root cause, not the fix. The new semantics: per-layer writes MUST
 *   target the segment row itself, never the host. These tests lock that invariant.
 */

describe('useTranscriptionSelfCertaintyController', () => {
  it('writes a segment-kind certainty onto the segment row itself, never onto the shared host', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-a',
            [
              {
                id: 'seg-1',
                layerId: 'layer-a',
                unitId: 'utt-a',
                mediaId: 'media-a',
                startTime: 1,
                endTime: 2,
              },
            ],
          ],
          [
            'layer-b',
            [
              {
                id: 'seg-1',
                layerId: 'layer-b',
                unitId: 'utt-b',
                mediaId: 'media-b',
                startTime: 10,
                endTime: 11,
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-1',
            layerId: 'layer-a',
            parentUnitId: 'utt-a',
            mediaId: 'media-a',
            startTime: 1,
            endTime: 2,
          },
          {
            id: 'seg-1',
            layerId: 'layer-b',
            parentUnitId: 'utt-b',
            mediaId: 'media-b',
            startTime: 10,
            endTime: 11,
          },
        ],
        units: [
          { id: 'utt-a', mediaId: 'media-a', startTime: 1, endTime: 2 },
          { id: 'utt-b', mediaId: 'media-b', startTime: 10, endTime: 11 },
        ],
        saveUnitSelfCertainty,
      }),
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'certain', 'layer-a');
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(
      [{ kind: 'segment', id: 'seg-1' }],
      'certain',
    );
    // Optimistic override only visible under the clicked (layerId, unitId).
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-a')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-b')).toBeUndefined();
  });

  it('does NOT leak into a linked sibling layer that shares the same host unit', () => {
    // 两层共享同一个 canonical host utt-host。以前这里 write target 被解析成 utt-host，
    // 然后 layer-b 的同 host 段读侧 fallback 拿到该值 → 串层。新语义下写段行，层互不干扰。
    // Two layers share the same canonical host utt-host. Pre-fix, the write resolved to
    // utt-host and layer-b's sibling segment leaked via host fallback. Post-fix: isolated.
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-a',
            [
              {
                id: 'seg-a',
                layerId: 'layer-a',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
              },
            ],
          ],
          [
            'layer-b',
            [
              {
                id: 'seg-b',
                layerId: 'layer-b',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-a',
            layerId: 'layer-a',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
          },
          {
            id: 'seg-b',
            layerId: 'layer-b',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
          },
        ],
        units: [{ id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }],
        saveUnitSelfCertainty,
      }),
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(['seg-a'], 'segment', 'certain', 'layer-a');
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(
      [{ kind: 'segment', id: 'seg-a' }],
      'certain',
    );
    expect(result.current.resolveSelfCertaintyForUnit('seg-a', 'layer-a')).toBe('certain');
    // linked sibling layer must NOT see a badge
    expect(result.current.resolveSelfCertaintyForUnit('seg-b', 'layer-b')).toBeUndefined();
    // neither should the shared host — reading it without a layer only surfaces
    // the canonical row's own value (undefined here).
    expect(result.current.resolveSelfCertaintyForUnit('utt-host')).toBeUndefined();
  });

  it('does NOT leak into an adjacent segment in the SAME layer that shares the same parent unit', () => {
    // 同层两个相邻段共享 parent utt-host（拆分段常见）。以前 write 落到 utt-host，
    // 相邻段 seg-2 读侧 fallback 跟着亮——典型的邻段污染。
    // Two adjacent segments in the same layer share parent utt-host (common after splits).
    // Pre-fix the write landed on utt-host and seg-2 lit up via host fallback.
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-seg',
            [
              {
                id: 'seg-1',
                layerId: 'layer-seg',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
              },
              {
                id: 'seg-2',
                layerId: 'layer-seg',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 2,
                endTime: 3,
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-1',
            layerId: 'layer-seg',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
          },
          {
            id: 'seg-2',
            layerId: 'layer-seg',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 2,
            endTime: 3,
          },
        ],
        units: [{ id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 3 }],
        saveUnitSelfCertainty,
      }),
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'certain',
        'layer-seg',
      );
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(
      [{ kind: 'segment', id: 'seg-1' }],
      'certain',
    );
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-2', 'layer-seg')).toBeUndefined();
  });

  it('keeps dependent display-lane reads isolated from the source segment storage layer', () => {
    // 依附层显示要按自己的 lane 作用域隔离；即便复用 source-layer 的物理段行，也不能直接显示源层徽标。
    // Dependent display lanes must stay isolated from the borrowed source segment storage layer.
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'source-layer',
            [
              {
                id: 'seg-1',
                layerId: 'source-layer',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
                selfCertainty: 'certain',
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-1',
            layerId: 'source-layer',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
            selfCertainty: 'certain',
          },
        ],
        units: [
          {
            id: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
            selfCertainty: 'certain',
          },
        ],
        saveUnitSelfCertainty: vi.fn(),
      }),
    );

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'source-layer')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBeUndefined();
  });

  it('stores segment-kind optimistic certainty under the clicked display lane scope', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'source-layer',
            [
              {
                id: 'seg-1',
                layerId: 'source-layer',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-1',
            layerId: 'source-layer',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
          },
        ],
        units: [{ id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }],
        saveUnitSelfCertainty,
      }),
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'certain',
        'display-layer',
      );
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(
      [{ kind: 'segment', id: 'seg-1' }],
      'certain',
    );
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'source-layer')).toBeUndefined();
  });

  it('writes a unit-kind certainty onto the canonical unit row', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map(),
        currentMediaUnits: [
          { id: 'utt-1', layerId: 'layer-utt', mediaId: 'media-1', startTime: 1, endTime: 2 },
        ],
        units: [{ id: 'utt-1', mediaId: 'media-1', startTime: 1, endTime: 2 }],
        saveUnitSelfCertainty,
      }),
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['utt-1'],
        'unit',
        'uncertain',
        'layer-utt',
      );
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(
      [{ kind: 'unit', id: 'utt-1' }],
      'uncertain',
    );
    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('uncertain');
  });

  it('drops unit-kind ids that are not in the canonical set (never accidentally writes a canonical row)', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map(),
        currentMediaUnits: [],
        units: [{ id: 'utt-known', mediaId: 'media-1', startTime: 0, endTime: 1 }],
        saveUnitSelfCertainty,
      }),
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['utt-unknown'],
        'unit',
        'certain',
        'layer-utt',
      );
    });

    expect(saveUnitSelfCertainty).not.toHaveBeenCalled();
  });

  it('reads a canonical unit row via (id, layerId) without any host gymnastics', () => {
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-utt',
            [
              {
                id: 'utt-1',
                layerId: 'layer-utt',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
                selfCertainty: 'certain',
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'utt-1',
            layerId: 'layer-utt',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
            selfCertainty: 'certain',
          },
        ],
        units: [
          { id: 'utt-1', mediaId: 'media-1', startTime: 1, endTime: 2, selfCertainty: 'certain' },
        ],
        saveUnitSelfCertainty: vi.fn(),
      }),
    );

    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('certain');
    // kind-less read also works for canonical units:
    expect(result.current.resolveSelfCertaintyForUnit('utt-1')).toBe('certain');
  });

  it('uses the segment unit itself as the target in segment-only projects (no parent unit)', () => {
    const saveUnitSelfCertainty = vi.fn();
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-seg',
            [
              {
                id: 'seg-only-1',
                layerId: 'layer-seg',
                mediaId: 'media-1',
                startTime: 12,
                endTime: 18,
                selfCertainty: 'certain',
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-only-1',
            layerId: 'layer-seg',
            mediaId: 'media-1',
            startTime: 12,
            endTime: 18,
            selfCertainty: 'certain',
          },
        ],
        units: [],
        saveUnitSelfCertainty,
      }),
    );

    expect(result.current.resolveSelfCertaintyForUnit('seg-only-1', 'layer-seg')).toBe('certain');

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-only-1'],
        'segment',
        'uncertain',
        'layer-seg',
      );
    });

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(
      [{ kind: 'segment', id: 'seg-only-1' }],
      'uncertain',
    );
    // Optimistic override flips the displayed value immediately.
    expect(result.current.resolveSelfCertaintyForUnit('seg-only-1', 'layer-seg')).toBe('uncertain');
  });

  it('ambiguity API is vestigial — always false under the new semantics', () => {
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-a',
            [{ id: 'seg-1', layerId: 'layer-a', mediaId: 'media-1', startTime: 1, endTime: 2 }],
          ],
        ]),
        currentMediaUnits: [
          { id: 'seg-1', layerId: 'layer-a', mediaId: 'media-1', startTime: 1, endTime: 2 },
        ],
        units: [
          { id: 'utt-x', mediaId: 'media-1', startTime: 1, endTime: 2 },
          { id: 'utt-y', mediaId: 'media-1', startTime: 1, endTime: 2 },
        ],
        saveUnitSelfCertainty: vi.fn(),
      }),
    );

    expect(result.current.resolveSelfCertaintyAmbiguityForUnit('seg-1', 'layer-a')).toBe(false);
  });

  it('resolveSelfCertaintyUnitIds only keeps ids that are known canonical units', () => {
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map(),
        currentMediaUnits: [],
        units: [
          { id: 'utt-a', mediaId: 'media-1', startTime: 0, endTime: 1 },
          { id: 'utt-b', mediaId: 'media-1', startTime: 1, endTime: 2 },
        ],
        saveUnitSelfCertainty: vi.fn(),
      }),
    );

    expect(
      result.current.resolveSelfCertaintyUnitIds(['utt-a', 'seg-x', 'utt-b', 'unknown']),
    ).toEqual(['utt-a', 'utt-b']);
  });

  it('does not leak certainty across layers when duplicate segment ids exist with distinct per-layer values', () => {
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-a',
            [
              {
                id: 'seg-dup',
                layerId: 'layer-a',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
                selfCertainty: 'certain',
              },
            ],
          ],
          [
            'layer-b',
            [{ id: 'seg-dup', layerId: 'layer-b', mediaId: 'media-1', startTime: 1, endTime: 2 }],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-dup',
            layerId: 'layer-a',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
            selfCertainty: 'certain',
          },
          { id: 'seg-dup', layerId: 'layer-b', mediaId: 'media-1', startTime: 1, endTime: 2 },
        ],
        units: [],
        saveUnitSelfCertainty: vi.fn(),
      }),
    );

    expect(result.current.resolveSelfCertaintyForUnit('seg-dup', 'layer-a')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-dup', 'layer-b')).toBeUndefined();
  });

  it('reads a canonical unit from its own row and does not project that value onto a segment', () => {
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          [
            'layer-a',
            [
              {
                id: 'seg-1',
                layerId: 'layer-a',
                unitId: 'utt-host',
                mediaId: 'media-1',
                startTime: 1,
                endTime: 2,
              },
            ],
          ],
        ]),
        currentMediaUnits: [
          {
            id: 'seg-1',
            layerId: 'layer-a',
            parentUnitId: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
          },
          { id: 'utt-host', layerId: 'layer-utt', mediaId: 'media-1', startTime: 1, endTime: 2 },
        ],
        units: [
          {
            id: 'utt-host',
            mediaId: 'media-1',
            startTime: 1,
            endTime: 2,
            selfCertainty: 'certain',
          },
        ],
        saveUnitSelfCertainty: vi.fn(),
      }),
    );

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-a')).toBeUndefined();
    expect(result.current.resolveSelfCertaintyForUnit('utt-host', 'layer-utt')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('utt-host')).toBe('certain');
  });

  it('keeps the optimistic badge after a successful save until readback, then follows undo, redo, and a disagreeing reload', async () => {
    const saveGate = deferred();
    const saveUnitSelfCertainty = vi.fn(() => saveGate.promise);
    const { result, rerender } = renderHook(
      (props: ControllerInput) => useTranscriptionSelfCertaintyController(props),
      { initialProps: segmentInput('uncertain', saveUnitSelfCertainty) },
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'certain',
        'layer-seg',
      );
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    await act(async () => {
      saveGate.resolve();
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    rerender(segmentInput('certain', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    rerender(segmentInput('uncertain', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('uncertain');

    rerender(segmentInput('certain', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    rerender(segmentInput('not_understood', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('not_understood');
  });

  it('keeps an in-flight badge across an early reload, then shows that reload once the save settles', async () => {
    const saveGate = deferred();
    const saveUnitSelfCertainty = vi.fn(() => saveGate.promise);
    const { result, rerender } = renderHook(
      (props: ControllerInput) => useTranscriptionSelfCertaintyController(props),
      { initialProps: segmentInput(undefined, saveUnitSelfCertainty) },
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'certain',
        'layer-seg',
      );
    });
    rerender(segmentInput('uncertain', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    await act(async () => {
      saveGate.resolve();
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('uncertain');
  });

  it('restores the persisted badge when the save is rejected and leaves the other layer alone', async () => {
    const saveUnitSelfCertainty = vi.fn(() => Promise.reject(new Error('rejected')));
    const layerA = segmentRow('uncertain', 'layer-a', 'seg-1');
    const layerB = segmentRow(undefined, 'layer-b', 'seg-1');
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController({
        segmentsByLayer: new Map([
          ['layer-a', [layerA]],
          ['layer-b', [layerB]],
        ]),
        currentMediaUnits: [layerA, layerB],
        units: [],
        saveUnitSelfCertainty,
      }),
    );

    await act(async () => {
      result.current.handleSetUnitSelfCertaintyFromMenu(['seg-1'], 'segment', 'certain', 'layer-a');
    });

    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-a')).toBe('uncertain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-b')).toBeUndefined();
  });

  it('does not let a rejected older save clear a newer optimistic value', async () => {
    const first = deferred();
    const second = deferred();
    const saveUnitSelfCertainty = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result, rerender } = renderHook(
      (props: ControllerInput) => useTranscriptionSelfCertaintyController(props),
      { initialProps: segmentInput(undefined, saveUnitSelfCertainty) },
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'uncertain',
        'layer-seg',
      );
    });
    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'certain',
        'layer-seg',
      );
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    await act(async () => {
      first.reject(new Error('stale'));
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    await act(async () => {
      second.resolve();
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    rerender(segmentInput('certain', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');
    rerender(segmentInput('not_understood', saveUnitSelfCertainty));
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('not_understood');
  });

  it('follows unit-row undo and redo after the optimistic value converges', async () => {
    const unitsUncertain = [
      {
        id: 'utt-1',
        mediaId: 'media-1',
        startTime: 1,
        endTime: 2,
        selfCertainty: 'uncertain' as const,
      },
    ];
    const unitsCertain = [
      {
        id: 'utt-1',
        mediaId: 'media-1',
        startTime: 1,
        endTime: 2,
        selfCertainty: 'certain' as const,
      },
    ];
    const currentMediaUnits = [
      { id: 'utt-1', layerId: 'layer-utt', mediaId: 'media-1', startTime: 1, endTime: 2 },
    ];
    const saveGate = deferred();
    const saveUnitSelfCertainty = vi.fn(() => saveGate.promise);
    const { result, rerender } = renderHook(
      (props: ControllerInput) => useTranscriptionSelfCertaintyController(props),
      {
        initialProps: {
          segmentsByLayer: new Map(),
          currentMediaUnits,
          units: unitsUncertain,
          saveUnitSelfCertainty,
        } as ControllerInput,
      },
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(['utt-1'], 'unit', 'certain', 'layer-utt');
    });
    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('certain');

    await act(async () => {
      saveGate.resolve();
    });
    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('certain');

    rerender({
      segmentsByLayer: new Map(),
      currentMediaUnits,
      units: unitsCertain,
      saveUnitSelfCertainty,
    });
    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('certain');

    rerender({
      segmentsByLayer: new Map(),
      currentMediaUnits,
      units: unitsUncertain,
      saveUnitSelfCertainty,
    });
    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('uncertain');

    rerender({
      segmentsByLayer: new Map(),
      currentMediaUnits,
      units: unitsCertain,
      saveUnitSelfCertainty,
    });
    expect(result.current.resolveSelfCertaintyForUnit('utt-1', 'layer-utt')).toBe('certain');
  });

  it('restores a cleared mark when save fails, and follows a later reload after a successful clear', async () => {
    const rejected = vi.fn(() => Promise.reject(new Error('clear rejected')));
    const { result } = renderHook(() =>
      useTranscriptionSelfCertaintyController(segmentInput('certain', rejected)),
    );

    await act(async () => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        undefined,
        'layer-seg',
      );
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');

    const saveGate = deferred();
    const saveUnitSelfCertainty = vi.fn(() => saveGate.promise);
    const { result: cleared, rerender } = renderHook(
      (props: ControllerInput) => useTranscriptionSelfCertaintyController(props),
      { initialProps: segmentInput('certain', saveUnitSelfCertainty) },
    );
    act(() => {
      cleared.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        undefined,
        'layer-seg',
      );
    });
    expect(cleared.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBeUndefined();
    await act(async () => {
      saveGate.resolve();
    });
    expect(cleared.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBeUndefined();

    rerender(segmentInput(undefined, saveUnitSelfCertainty));
    expect(cleared.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBeUndefined();
    rerender(segmentInput('certain', saveUnitSelfCertainty));
    expect(cleared.current.resolveSelfCertaintyForUnit('seg-1', 'layer-seg')).toBe('certain');
  });

  it('drops a display-lane override once the segment snapshot is replaced', async () => {
    const saveGate = deferred();
    const saveUnitSelfCertainty = vi.fn(() => saveGate.promise);
    const source = {
      id: 'seg-1',
      layerId: 'source-layer',
      unitId: 'utt-host',
      mediaId: 'media-1',
      startTime: 1,
      endTime: 2,
    };
    const { result, rerender } = renderHook(
      (props: ControllerInput) => useTranscriptionSelfCertaintyController(props),
      {
        initialProps: {
          segmentsByLayer: new Map([['source-layer', [source]]]),
          currentMediaUnits: [source],
          units: [{ id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }],
          saveUnitSelfCertainty,
        },
      },
    );

    act(() => {
      result.current.handleSetUnitSelfCertaintyFromMenu(
        ['seg-1'],
        'segment',
        'certain',
        'display-layer',
      );
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBe('certain');
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'source-layer')).toBeUndefined();

    await act(async () => {
      saveGate.resolve();
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBe('certain');

    const readBack = { ...source, selfCertainty: 'certain' as const };
    rerender({
      segmentsByLayer: new Map([['source-layer', [readBack]]]),
      currentMediaUnits: [readBack],
      units: [{ id: 'utt-host', mediaId: 'media-1', startTime: 1, endTime: 2 }],
      saveUnitSelfCertainty,
    });
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'display-layer')).toBeUndefined();
    expect(result.current.resolveSelfCertaintyForUnit('seg-1', 'source-layer')).toBe('certain');
  });
});
