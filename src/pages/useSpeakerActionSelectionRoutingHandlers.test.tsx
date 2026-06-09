// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../types/jieyuDbDocTypes';
import { useSpeakerActionSelectionRoutingHandlers } from './useSpeakerActionSelectionRoutingHandlers';

function makeSegment(id: string): LayerUnitDocType {
  return {
    id,
    layerId: 'layer-seg',
    mediaId: 'media-1',
    textId: 'text-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerUnitDocType;
}

describe('useSpeakerActionSelectionRoutingHandlers', () => {
  it('routes batch segment assign through handleAssignSpeakerToSegments', async () => {
    const handleAssignSpeakerToSegments = vi.fn(async () => {});
    const handleAssignSpeakerToSelected = vi.fn(async () => {});
    const applySpeakerToMixedSelection = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useSpeakerActionSelectionRoutingHandlers({
        selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1')],
        selectedStandaloneUnitIdsForSpeakerActions: [],
        speakerOptions: [],
        speakerDraftName: '',
        batchSpeakerId: 'spk-a',
        selectedSpeakerActionCount: 1,
        handleAssignSpeakerToUnits: vi.fn(async () => {}),
        handleAssignSpeakerToSelected,
        handleCreateSpeakerAndAssign: vi.fn(async () => {}),
        openSpeakerManagementPanel: vi.fn(),
        handleAssignSpeakerToSegments,
        createSpeakerAndAssignToSegments: vi.fn(async () => {}),
        applySpeakerToMixedSelection,
        createSpeakerAndAssignToMixedSelection: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(handleAssignSpeakerToSegments).toHaveBeenCalledWith(['seg-1'], 'spk-a');
    expect(applySpeakerToMixedSelection).not.toHaveBeenCalled();
    expect(handleAssignSpeakerToSelected).not.toHaveBeenCalled();
  });

  it('routes mixed selection assign through applySpeakerToMixedSelection', async () => {
    const applySpeakerToMixedSelection = vi.fn(async () => {});

    const { result } = renderHook(() =>
      useSpeakerActionSelectionRoutingHandlers({
        selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1')],
        selectedStandaloneUnitIdsForSpeakerActions: ['utt-1'],
        speakerOptions: [],
        speakerDraftName: '',
        batchSpeakerId: 'spk-a',
        selectedSpeakerActionCount: 2,
        handleAssignSpeakerToUnits: vi.fn(async () => {}),
        handleAssignSpeakerToSelected: vi.fn(async () => {}),
        handleCreateSpeakerAndAssign: vi.fn(async () => {}),
        openSpeakerManagementPanel: vi.fn(),
        handleAssignSpeakerToSegments: vi.fn(async () => {}),
        createSpeakerAndAssignToSegments: vi.fn(async () => {}),
        applySpeakerToMixedSelection,
        createSpeakerAndAssignToMixedSelection: vi.fn(async () => {}),
      }),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(applySpeakerToMixedSelection).toHaveBeenCalledWith('spk-a');
  });
});
