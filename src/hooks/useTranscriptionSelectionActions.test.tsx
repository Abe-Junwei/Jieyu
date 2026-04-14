// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useTranscriptionSelectionActions } from './useTranscriptionSelectionActions';

describe('useTranscriptionSelectionActions', () => {
  it('preserves incoming layerId when selectTimelineUnit is called', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('');
      const selectedUnitIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('layer-default');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectTimelineUnit({
        layerId: 'layer-explicit',
        unitId: 'utt-1',
        kind: 'utterance',
      });
    });

    expect(setSelectedTimelineUnit).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer-explicit',
      unitId: 'utt-1',
      kind: 'utterance',
    }));
    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-explicit');
    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['utt-1']));
  });

  it('falls back to selectedLayerId when selectTimelineUnit receives an empty layerId', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('utt-1');
      const selectedUnitIdsRef = useRef(new Set<string>(['utt-1']));
      const selectedLayerIdRef = useRef('layer-default');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectTimelineUnit({
        layerId: '   ',
        unitId: 'seg-1',
        kind: 'segment',
      });
    });

    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-default');
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith({
      layerId: 'layer-default',
      unitId: 'seg-1',
      kind: 'segment',
    });
    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set());
  });

  it('falls back to selectedTimelineUnit.layerId for setUnitSelection when selectedLayerId is empty', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('');
      const selectedUnitIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('');
      const selectedTimelineUnitRef = useRef({ layerId: 'layer-fallback', unitId: 'utt-prev', kind: 'utterance' as const });
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectUnit('utt-2');
    });

    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-fallback');
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith({
      layerId: 'layer-fallback',
      unitId: 'utt-2',
      kind: 'utterance',
    });
    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['utt-2']));
  });

  it('falls back to defaultTranscriptionLayerId when both selectedLayerId and selectedTimelineUnit are empty', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('');
      const selectedUnitIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        defaultTranscriptionLayerId: 'layer-default',
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectUnit('utt-2');
    });

    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-default');
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith({
      layerId: 'layer-default',
      unitId: 'utt-2',
      kind: 'utterance',
    });
    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['utt-2']));
  });

  it('falls back to fallbackLayerId when selected/default layers are unavailable', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('');
      const selectedUnitIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        fallbackLayerId: 'layer-first',
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectUnit('utt-2');
    });

    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-first');
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith({
      layerId: 'layer-first',
      unitId: 'utt-2',
      kind: 'utterance',
    });
    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['utt-2']));
  });

  it('logs missing layerId only once per source to avoid console spam', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('');
      const selectedUnitIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('   ');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectUnit('utt-1');
      result.current.selectUnit('utt-2');
      result.current.selectUnit('utt-3');
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain('Missing layerId in setUnitSelection');
    consoleErrorSpy.mockRestore();
  });

  it('seeds from primary selection when toggleSegmentSelection is called with empty set (B1 fix)', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('seg-1');
      const selectedUnitIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('layer-a');
      const selectedTimelineUnitRef = useRef({ layerId: 'layer-a', unitId: 'seg-1', kind: 'segment' as const });
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.toggleSegmentSelection('seg-2');
    });

    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['seg-1', 'seg-2']));
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'seg-2',
      kind: 'segment',
    }));
  });

  it('deselects segment correctly in toggleSegmentSelection when already in set', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('seg-2');
      const selectedUnitIdsRef = useRef(new Set<string>(['seg-1', 'seg-2']));
      const selectedLayerIdRef = useRef('layer-a');
      const selectedTimelineUnitRef = useRef({ layerId: 'layer-a', unitId: 'seg-2', kind: 'segment' as const });
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.toggleSegmentSelection('seg-2');
    });

    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['seg-1']));
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'seg-1',
      kind: 'segment',
    }));
  });

  it('clears selection state for segment when selectTimelineUnit is called with segment kind', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('utt-1');
      const selectedUnitIdsRef = useRef(new Set<string>(['utt-1', 'utt-2']));
      const selectedLayerIdRef = useRef('layer-a');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectTimelineUnit({
        layerId: 'layer-a',
        unitId: 'seg-1',
        kind: 'segment',
      });
    });

    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set());
  });

  it('skips state updates when setUnitSelection receives an unchanged selection', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUnitIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUnitIdRef = useRef('utt-1');
      const selectedUnitIdsRef = useRef(new Set<string>(['utt-1', 'utt-2']));
      const selectedLayerIdRef = useRef('layer-a');
      const selectedTimelineUnitRef = useRef({ layerId: 'layer-a', unitId: 'utt-1', kind: 'utterance' as const });
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUnitIdRef,
        selectedUnitIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUnitIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.setUnitSelection('utt-1', new Set(['utt-2', 'utt-1']));
    });

    expect(setSelectedLayerId).not.toHaveBeenCalled();
    expect(setSelectedUnitIds).not.toHaveBeenCalled();
    expect(setSelectedTimelineUnit).not.toHaveBeenCalled();
  });
});
