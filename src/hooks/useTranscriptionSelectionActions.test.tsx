// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useTranscriptionSelectionActions } from './useTranscriptionSelectionActions';

describe('useTranscriptionSelectionActions', () => {
  it('preserves incoming layerId when selectTimelineUnit is called', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUtteranceIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUtteranceUnitIdRef = useRef('');
      const selectedUtteranceIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('layer-default');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUtteranceUnitIdRef,
        selectedUtteranceIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUtteranceIds,
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
    expect(setSelectedUtteranceIds).toHaveBeenCalledWith(new Set(['utt-1']));
  });

  it('clears selection when selectTimelineUnit receives an empty layerId', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUtteranceIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUtteranceUnitIdRef = useRef('utt-1');
      const selectedUtteranceIdsRef = useRef(new Set<string>(['utt-1']));
      const selectedLayerIdRef = useRef('layer-default');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUtteranceUnitIdRef,
        selectedUtteranceIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUtteranceIds,
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

    expect(setSelectedTimelineUnit).toHaveBeenCalledWith(null);
    expect(setSelectedUtteranceIds).toHaveBeenCalledWith(new Set());
  });

  it('falls back to selectedTimelineUnit.layerId for setUtteranceSelection when selectedLayerId is empty', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUtteranceIds = vi.fn();
    const setSelectedLayerId = vi.fn();

    const { result } = renderHook(() => {
      const selectedUtteranceUnitIdRef = useRef('');
      const selectedUtteranceIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('');
      const selectedTimelineUnitRef = useRef({ layerId: 'layer-fallback', unitId: 'utt-prev', kind: 'utterance' as const });
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUtteranceUnitIdRef,
        selectedUtteranceIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUtteranceIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectUtterance('utt-2');
    });

    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-fallback');
    expect(setSelectedTimelineUnit).toHaveBeenCalledWith({
      layerId: 'layer-fallback',
      unitId: 'utt-2',
      kind: 'utterance',
    });
    expect(setSelectedUtteranceIds).toHaveBeenCalledWith(new Set(['utt-2']));
  });

  it('logs missing layerId only once per source to avoid console spam', () => {
    const setSelectedTimelineUnit = vi.fn();
    const setSelectedUtteranceIds = vi.fn();
    const setSelectedLayerId = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => {
      const selectedUtteranceUnitIdRef = useRef('');
      const selectedUtteranceIdsRef = useRef(new Set<string>());
      const selectedLayerIdRef = useRef('   ');
      const selectedTimelineUnitRef = useRef(null);
      const utterancesOnCurrentMediaRef = useRef([]);
      return useTranscriptionSelectionActions({
        selectedUtteranceUnitIdRef,
        selectedUtteranceIdsRef,
        selectedLayerIdRef,
        selectedTimelineUnitRef,
        utterancesOnCurrentMediaRef,
        setSelectedLayerId,
        setSelectedUtteranceIds,
        setSelectedTimelineUnit,
      });
    });

    act(() => {
      result.current.selectUtterance('utt-1');
      result.current.selectUtterance('utt-2');
      result.current.selectUtterance('utt-3');
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain('Missing layerId in setUtteranceSelection');
    consoleErrorSpy.mockRestore();
  });
});
