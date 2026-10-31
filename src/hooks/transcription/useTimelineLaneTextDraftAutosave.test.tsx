// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, FocusEvent, MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as fireAndForgetModule from '../../utils/fireAndForget';
import {
  useMediaTranslationLaneRowDraftAutosave,
  useTranscriptionMediaLaneRowTextAutosave,
  useTranslationSidebarTextDraftAutosave,
} from './useTimelineLaneTextDraftAutosave';

describe('useTranscriptionMediaLaneRowTextAutosave', () => {
  it('schedules segment saves with seg- debounce key', () => {
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitText = vi.fn().mockResolvedValue(undefined);
    const setUnitDrafts = vi.fn();
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };

    const { result } = renderHook(() =>
      useTranscriptionMediaLaneRowTextAutosave({
        unitKind: 'segment',
        layerId: 'L1',
        unitId: 'U1',
        draftKey: 'dk',
        sourceText: 'orig',
        setUnitDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitText,
        focusedTranslationDraftKeyRef,
      }),
    );

    act(() => {
      result.current.handleDraftChange({
        target: { value: '  hi  ' },
      } as ChangeEvent<HTMLInputElement>);
    });

    expect(scheduleAutoSave).toHaveBeenCalledWith('seg-L1-U1', expect.any(Function));
  });

  it('clears utt- debounce when unit text is empty or unchanged', () => {
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitText = vi.fn().mockResolvedValue(undefined);
    const setUnitDrafts = vi.fn();
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };

    const { result } = renderHook(() =>
      useTranscriptionMediaLaneRowTextAutosave({
        unitKind: 'unit',
        layerId: 'L1',
        unitId: 'U1',
        draftKey: 'dk',
        sourceText: 'same',
        setUnitDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitText,
        focusedTranslationDraftKeyRef,
      }),
    );

    act(() => {
      result.current.handleDraftChange({
        target: { value: '   ' },
      } as ChangeEvent<HTMLInputElement>);
    });
    expect(clearAutoSaveTimer).toHaveBeenCalledWith('utt-L1-U1');
    expect(scheduleAutoSave).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDraftChange({
        target: { value: 'same' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(clearAutoSaveTimer).toHaveBeenCalledWith('utt-L1-U1');
  });
});

describe('useTranslationSidebarTextDraftAutosave', () => {
  it('clearDraftDebounce clears seg- key when usesOwnSegments', () => {
    const clearAutoSaveTimer = vi.fn();
    const scheduleAutoSave = vi.fn();
    const runSaveWithStatus = vi.fn().mockResolvedValue(undefined);
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitLayerText = vi.fn().mockResolvedValue(undefined);
    const setTranslationDrafts = vi.fn();
    const setCellSaveStatus = vi.fn();

    const { result } = renderHook(() =>
      useTranslationSidebarTextDraftAutosave({
        usesOwnSegments: true,
        layerId: 'L1',
        unitId: 'S1',
        draftKey: 'dk',
        cellKey: 'ck',
        text: 't',
        setTranslationDrafts,
        setCellSaveStatus,
        scheduleAutoSave,
        clearAutoSaveTimer,
        runSaveWithStatus,
        saveSegmentContentForLayer,
        saveUnitLayerText,
      }),
    );

    act(() => {
      result.current.clearDraftDebounce();
    });

    expect(clearAutoSaveTimer).toHaveBeenCalledWith('seg-L1-S1');
  });

  it('clearDraftDebounce clears tr- key when not usesOwnSegments', () => {
    const clearAutoSaveTimer = vi.fn();
    const scheduleAutoSave = vi.fn();
    const runSaveWithStatus = vi.fn().mockResolvedValue(undefined);
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitLayerText = vi.fn().mockResolvedValue(undefined);
    const setTranslationDrafts = vi.fn();
    const setCellSaveStatus = vi.fn();

    const { result } = renderHook(() =>
      useTranslationSidebarTextDraftAutosave({
        usesOwnSegments: false,
        layerId: 'L1',
        unitId: 'U1',
        draftKey: 'dk',
        cellKey: 'ck',
        text: 't',
        setTranslationDrafts,
        setCellSaveStatus,
        scheduleAutoSave,
        clearAutoSaveTimer,
        runSaveWithStatus,
        saveSegmentContentForLayer,
        saveUnitLayerText,
      }),
    );

    act(() => {
      result.current.clearDraftDebounce();
    });

    expect(clearAutoSaveTimer).toHaveBeenCalledWith('tr-L1-U1');
  });

  it('debounced segment change uses seg- key', () => {
    const clearAutoSaveTimer = vi.fn();
    const scheduleAutoSave = vi.fn();
    const runSaveWithStatus = vi.fn().mockImplementation((_cellKey, task) => task());
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitLayerText = vi.fn().mockResolvedValue(undefined);
    const setTranslationDrafts = vi.fn();
    const setCellSaveStatus = vi.fn();

    const { result } = renderHook(() =>
      useTranslationSidebarTextDraftAutosave({
        usesOwnSegments: true,
        layerId: 'L1',
        unitId: 'S1',
        draftKey: 'dk',
        cellKey: 'ck',
        text: 'old',
        setTranslationDrafts,
        setCellSaveStatus,
        scheduleAutoSave,
        clearAutoSaveTimer,
        runSaveWithStatus,
        saveSegmentContentForLayer,
        saveUnitLayerText,
      }),
    );

    act(() => {
      result.current.handleDraftChange({
        target: { value: 'new' },
      } as ChangeEvent<HTMLInputElement>);
    });

    expect(scheduleAutoSave).toHaveBeenCalledWith('seg-L1-S1', expect.any(Function));
  });
});

describe('useTranscriptionMediaLaneRowTextAutosave blur', () => {
  it('fires segment persist on blur when value changed', async () => {
    vi.spyOn(fireAndForgetModule, 'fireAndForget').mockImplementation((p) => {
      void p;
    });
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitText = vi.fn().mockResolvedValue(undefined);
    const setUnitDrafts = vi.fn();
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };

    const { result } = renderHook(() =>
      useTranscriptionMediaLaneRowTextAutosave({
        unitKind: 'segment',
        layerId: 'L1',
        unitId: 'U1',
        draftKey: 'dk',
        sourceText: 'orig',
        setUnitDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitText,
        focusedTranslationDraftKeyRef,
      }),
    );

    act(() => {
      result.current.handleDraftBlur({
        target: { value: 'edited' },
      } as FocusEvent<HTMLInputElement>);
    });

    expect(clearAutoSaveTimer).toHaveBeenCalledWith('seg-L1-U1');
    expect(fireAndForgetModule.fireAndForget).toHaveBeenCalled();
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('U1', 'L1', 'edited');
    vi.restoreAllMocks();
  });
});

describe('useMediaTranslationLaneRowDraftAutosave', () => {
  it('segment mode schedules save only when value differs from committed text', () => {
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitLayerText = vi.fn().mockResolvedValue(undefined);
    const setTranslationDrafts = vi.fn();
    const latestDraftRef: MutableRefObject<string> = { current: '' };
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };
    const runSaveWithStatus = vi.fn(async (task: () => Promise<void>) => {
      await task();
    });

    const { result } = renderHook(() =>
      useMediaTranslationLaneRowDraftAutosave({
        usesOwnSegments: true,
        layerId: 'L1',
        unitId: 'S1',
        draftKey: 'dk',
        text: 'committed',
        setTranslationDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitLayerText,
        focusedTranslationDraftKeyRef,
        latestDraftRef,
        setRowSaveStatus: vi.fn(),
        runSaveWithStatus,
      }),
    );

    act(() => {
      result.current.handleDraftChange({
        target: { value: 'committed' },
      } as ChangeEvent<HTMLInputElement>);
    });
    expect(clearAutoSaveTimer).toHaveBeenCalledWith('seg-L1-S1');
    expect(scheduleAutoSave).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDraftChange({
        target: { value: 'edited' },
      } as ChangeEvent<HTMLInputElement>);
    });
    expect(scheduleAutoSave).toHaveBeenCalledWith('seg-L1-S1', expect.any(Function));
  });

  it('unit mode clears timer when text is empty', () => {
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitLayerText = vi.fn().mockResolvedValue(undefined);
    const setTranslationDrafts = vi.fn();
    const latestDraftRef: MutableRefObject<string> = { current: '' };
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };
    const runSaveWithStatus = vi.fn(async (task: () => Promise<void>) => {
      await task();
    });

    const { result } = renderHook(() =>
      useMediaTranslationLaneRowDraftAutosave({
        usesOwnSegments: false,
        layerId: 'L1',
        unitId: 'U1',
        draftKey: 'dk',
        text: 'same',
        setTranslationDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitLayerText,
        focusedTranslationDraftKeyRef,
        latestDraftRef,
        setRowSaveStatus: vi.fn(),
        runSaveWithStatus,
      }),
    );

    act(() => {
      result.current.handleDraftChange({
        target: { value: '   ' },
      } as ChangeEvent<HTMLInputElement>);
    });
    expect(clearAutoSaveTimer).toHaveBeenCalledWith('tr-L1-U1');
    expect(scheduleAutoSave).not.toHaveBeenCalled();
  });
});

describe('useTranscriptionMediaLaneRowTextAutosave unit writer (#454)', () => {
  it('schedules unit-text save via saveUnitText, not saveUnitLayerText', async () => {
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitText = vi.fn().mockResolvedValue(undefined);
    const setUnitDrafts = vi.fn();
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };

    const { result } = renderHook(() =>
      useTranscriptionMediaLaneRowTextAutosave({
        unitKind: 'unit',
        layerId: 'trc-1',
        unitId: 'U1',
        draftKey: 'dk',
        sourceText: 'orig',
        setUnitDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitText,
        focusedTranslationDraftKeyRef,
      }),
    );

    act(() => {
      result.current.handleDraftChange({
        target: { value: 'edited' },
      } as ChangeEvent<HTMLInputElement>);
    });

    expect(scheduleAutoSave).toHaveBeenCalledWith('utt-trc-1-U1', expect.any(Function));
    const task = scheduleAutoSave.mock.calls[0]?.[1] as () => Promise<void>;
    await act(async () => {
      await task();
    });
    expect(saveUnitText).toHaveBeenCalledWith('U1', 'edited', 'trc-1');
  });

  it('blur persists unit text through saveUnitText', async () => {
    vi.spyOn(fireAndForgetModule, 'fireAndForget').mockImplementation((p) => {
      void p;
    });
    const scheduleAutoSave = vi.fn();
    const clearAutoSaveTimer = vi.fn();
    const saveSegmentContentForLayer = vi.fn().mockResolvedValue(undefined);
    const saveUnitText = vi.fn().mockResolvedValue(undefined);
    const setUnitDrafts = vi.fn();
    const focusedTranslationDraftKeyRef: MutableRefObject<string | null> = { current: null };

    const { result } = renderHook(() =>
      useTranscriptionMediaLaneRowTextAutosave({
        unitKind: 'unit',
        layerId: 'trc-1',
        unitId: 'U1',
        draftKey: 'dk',
        sourceText: 'orig',
        setUnitDrafts,
        scheduleAutoSave,
        clearAutoSaveTimer,
        saveSegmentContentForLayer,
        saveUnitText,
        focusedTranslationDraftKeyRef,
      }),
    );

    act(() => {
      result.current.handleDraftBlur({
        target: { value: 'edited' },
      } as FocusEvent<HTMLInputElement>);
    });

    expect(saveUnitText).toHaveBeenCalledWith('U1', 'edited', 'trc-1');
    vi.restoreAllMocks();
  });
});

describe('transcription unit writer vs layer writer (#454)', () => {
  it('createSaveUnitLayerText rejects a transcription layer id', async () => {
    const { createSaveUnitLayerText } = await import('./useTranscriptionUnitActions.textWrites');
    const setSaveState = vi.fn();
    const saveLayer = createSaveUnitLayerText({
      defaultTranscriptionLayerId: 'trc-1',
      layerById: new Map([
        [
          'trc-1',
          {
            id: 'trc-1',
            textId: 't1',
            key: 'trc',
            name: { zho: '转写' },
            layerType: 'transcription',
            languageId: 'und',
            modality: 'text',
            isDefault: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ]) as never,
      locale: 'zh-CN',
      pushUndo: vi.fn(),
      resolveUnitById: vi.fn(async () => null),
      setSaveState,
      setTranslations: vi.fn(),
      setUnitDrafts: vi.fn(),
    });
    await saveLayer('U1', 'edited', 'trc-1');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });
});
