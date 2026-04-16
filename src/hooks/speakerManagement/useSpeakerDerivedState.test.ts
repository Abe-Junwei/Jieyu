// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SpeakerDocType, LayerUnitDocType } from '../../db';
import { useSpeakerDerivedState } from './useSpeakerDerivedState';

function makeSpeaker(overrides: Partial<SpeakerDocType> = {}): SpeakerDocType {
  return {
    id: 'spk-1',
    name: 'Alice',
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z',
    ...overrides,
  };
}

function makeUnit(overrides: Partial<LayerUnitDocType> = {}): LayerUnitDocType {
  return {
    id: 'utt-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    transcription: { default: '' },
    words: [],
    ...overrides,
  } as unknown as LayerUnitDocType;
}

describe('useSpeakerDerivedState', () => {
  it('derives visual map, filter options, and selected summary', () => {
    const units = [
      makeUnit({ id: 'utt-1', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ id: 'utt-2', speaker: '访客' }),
    ];
    const speakers = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];
    const selected = [units[0]!];

    const { result } = renderHook(() => useSpeakerDerivedState(units, selected, speakers));

    expect(result.current.speakerVisualByUnitId['utt-1']?.name).toBe('Alice');
    expect(result.current.speakerVisualByUnitId['utt-2']).toBeUndefined();
    expect(result.current.speakerFilterOptions.length).toBe(1);
    expect(result.current.selectedSpeakerSummary).toBe('当前统一说话人：Alice');
  });

  it('updates derived summary when selection changes', () => {
    const units = [
      makeUnit({ id: 'utt-1', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ id: 'utt-2', speaker: '访客' }),
    ];
    const speakers = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];

    const { result, rerender } = renderHook(
      ({ selectedBatchUnits }) => useSpeakerDerivedState(units, selectedBatchUnits, speakers),
      { initialProps: { selectedBatchUnits: [units[0]!] as LayerUnitDocType[] } },
    );

    expect(result.current.selectedSpeakerSummary).toBe('当前统一说话人：Alice');

    rerender({ selectedBatchUnits: units });
    expect(result.current.selectedSpeakerSummary).toBe('当前统一说话人：Alice');

    rerender({ selectedBatchUnits: [] });
    expect(result.current.selectedSpeakerSummary).toBe('未选择句段');
  });
});