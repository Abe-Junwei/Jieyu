// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SpeakerDocType, UtteranceDocType } from '../../db';
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

function makeUtterance(overrides: Partial<UtteranceDocType> = {}): UtteranceDocType {
  return {
    id: 'utt-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    transcription: { default: '' },
    words: [],
    ...overrides,
  } as unknown as UtteranceDocType;
}

describe('useSpeakerDerivedState', () => {
  it('derives visual map, filter options, and selected summary', () => {
    const utterances = [
      makeUtterance({ id: 'utt-1', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUtterance({ id: 'utt-2', speaker: '访客' }),
    ];
    const speakers = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];
    const selected = [utterances[0]!];

    const { result } = renderHook(() => useSpeakerDerivedState(utterances, selected, speakers));

    expect(result.current.speakerVisualByUtteranceId['utt-1']?.name).toBe('Alice');
    expect(result.current.speakerVisualByUtteranceId['utt-2']?.name).toBe('访客');
    expect(result.current.speakerFilterOptions.length).toBe(2);
    expect(result.current.selectedSpeakerSummary).toBe('当前统一说话人：Alice');
  });

  it('updates derived summary when selection changes', () => {
    const utterances = [
      makeUtterance({ id: 'utt-1', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUtterance({ id: 'utt-2', speaker: '访客' }),
    ];
    const speakers = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];

    const { result, rerender } = renderHook(
      ({ selectedBatchUtterances }) => useSpeakerDerivedState(utterances, selectedBatchUtterances, speakers),
      { initialProps: { selectedBatchUtterances: [utterances[0]!] as UtteranceDocType[] } },
    );

    expect(result.current.selectedSpeakerSummary).toBe('当前统一说话人：Alice');

    rerender({ selectedBatchUtterances: utterances });
    expect(result.current.selectedSpeakerSummary).toBe('当前包含 2 位说话人');

    rerender({ selectedBatchUtterances: [] });
    expect(result.current.selectedSpeakerSummary).toBe('未选择句段');
  });
});