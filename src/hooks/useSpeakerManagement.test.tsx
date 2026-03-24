// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakerDocType, UtteranceDocType } from '../db';
import {
  useSpeakerManagement,
  type UseSpeakerManagementOptions,
} from './useSpeakerManagement';

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    getSpeakers: vi.fn(async () => []),
    assignSpeakerToUtterances: vi.fn(async () => 0),
    createSpeaker: vi.fn(async () => ({
      id: 'speaker-new',
      name: '新说话人',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    })),
  },
}));

import { LinguisticService } from '../services/LinguisticService';

function makeUtterance(overrides: Partial<UtteranceDocType> = {}): UtteranceDocType {
  const base: Record<string, unknown> = {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
    annotationStatus: 'raw',
  };
  return { ...base, ...overrides } as UtteranceDocType;
}

function makeSpeaker(overrides: Partial<SpeakerDocType> = {}): SpeakerDocType {
  return {
    id: 'speaker-1',
    name: '说话人甲',
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeOptions(overrides: Partial<UseSpeakerManagementOptions> = {}): UseSpeakerManagementOptions {
  const utterances = overrides.utterancesOnCurrentMedia ?? [makeUtterance()];
  return {
    utterancesOnCurrentMedia: utterances,
    selectedUtteranceId: overrides.selectedUtteranceId ?? utterances[0]?.id ?? null,
    selectedUtteranceIds: overrides.selectedUtteranceIds ?? new Set<string>(),
    selectedBatchUtterances: overrides.selectedBatchUtterances ?? [],
    isReady: overrides.isReady ?? true,
    setUtteranceSelection: overrides.setUtteranceSelection ?? vi.fn(),
    data: overrides.data ?? {
      pushUndo: vi.fn(),
      undo: vi.fn(async () => {}),
    },
    loadSnapshot: overrides.loadSnapshot ?? vi.fn(async () => {}),
    setSaveState: overrides.setSaveState ?? vi.fn(),
    getUtteranceTextForLayer: overrides.getUtteranceTextForLayer ?? (() => '示例文本'),
    formatTime: overrides.formatTime ?? ((seconds: number) => `${seconds.toFixed(1)}s`),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSpeakerManagement', () => {
  beforeEach(() => {
    vi.mocked(LinguisticService.getSpeakers).mockResolvedValue([makeSpeaker()]);
  });

  it('loads speaker options when ready', async () => {
    const { result } = renderHook(() => useSpeakerManagement(makeOptions({ isReady: true })));

    await waitFor(() => {
      expect(result.current.speakerOptions).toHaveLength(1);
    });

    expect(result.current.speakerOptions[0]?.name).toBe('说话人甲');
  });

  it('selects utterances by speaker key and updates active filter', () => {
    const setUtteranceSelection = vi.fn();
    const utterances = [
      makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '说话人甲' }),
      makeUtterance({ id: 'utt-2', speakerId: 'speaker-1', speaker: '说话人甲', startTime: 2, endTime: 3 }),
      makeUtterance({ id: 'utt-3', speakerId: 'speaker-2', speaker: '说话人乙', startTime: 4, endTime: 5 }),
    ];

    const { result } = renderHook(() => useSpeakerManagement(makeOptions({
      utterancesOnCurrentMedia: utterances,
      selectedUtteranceId: 'utt-2',
      setUtteranceSelection,
      isReady: false,
    })));

    act(() => {
      result.current.handleSelectSpeakerUtterances('speaker-1');
    });

    expect(setUtteranceSelection).toHaveBeenCalledWith('utt-2', ['utt-1', 'utt-2']);
    expect(result.current.activeSpeakerFilterKey).toBe('speaker-1');
  });

  it('assigns speaker to selected utterances in batch', async () => {
    const setSaveState = vi.fn();
    const loadSnapshot = vi.fn(async () => {});
    const pushUndo = vi.fn();

    vi.mocked(LinguisticService.assignSpeakerToUtterances).mockResolvedValue(2);

    const { result } = renderHook(() => useSpeakerManagement(makeOptions({
      isReady: false,
      selectedUtteranceIds: new Set(['utt-1', 'utt-2']),
      selectedBatchUtterances: [
        makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '说话人甲' }),
        makeUtterance({ id: 'utt-2', speakerId: 'speaker-1', speaker: '说话人甲', startTime: 2, endTime: 3 }),
      ],
      loadSnapshot,
      setSaveState,
      data: {
        pushUndo,
        undo: vi.fn(async () => {}),
      },
    })));

    act(() => {
      result.current.setBatchSpeakerId('speaker-1');
    });

    await act(async () => {
      await result.current.handleAssignSpeakerToSelected();
    });

    expect(pushUndo).toHaveBeenCalledWith('批量指派说话人');
    expect(LinguisticService.assignSpeakerToUtterances).toHaveBeenCalledWith(new Set(['utt-1', 'utt-2']), 'speaker-1');
    expect(loadSnapshot).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('creates a speaker and assigns to selected utterances', async () => {
    const setSaveState = vi.fn();
    const loadSnapshot = vi.fn(async () => {});
    const pushUndo = vi.fn();

    vi.mocked(LinguisticService.createSpeaker).mockResolvedValue(makeSpeaker({ id: 'speaker-new', name: '新说话人' }));
    vi.mocked(LinguisticService.assignSpeakerToUtterances).mockResolvedValue(1);

    const { result } = renderHook(() => useSpeakerManagement(makeOptions({
      isReady: false,
      selectedUtteranceIds: new Set(['utt-1']),
      selectedBatchUtterances: [
        makeUtterance({ id: 'utt-1' }),
      ],
      loadSnapshot,
      setSaveState,
      data: {
        pushUndo,
        undo: vi.fn(async () => {}),
      },
    })));

    act(() => {
      result.current.setSpeakerDraftName('新说话人');
    });

    await act(async () => {
      await result.current.handleCreateSpeakerAndAssign();
    });

    expect(pushUndo).toHaveBeenCalledWith('新建并分配说话人');
    expect(LinguisticService.createSpeaker).toHaveBeenCalledWith({ name: '新说话人' });
    expect(LinguisticService.assignSpeakerToUtterances).toHaveBeenCalledWith(new Set(['utt-1']), 'speaker-new');
    expect(loadSnapshot).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
    expect(result.current.speakerDraftName).toBe('');
  });
});
