import { describe, expect, it } from 'vitest';
import type { SpeakerDocType, LayerUnitDocType } from '../../db';
import { applySpeakerAssignmentToUnits, buildSelectedSpeakerSummary, buildSpeakerFilterOptions, buildSpeakerFilterOptionsFromKeys, buildSpeakerVisualMap, buildSpeakerVisualMapFromKeys, getSpeakerDisplayNameByKey, getUnitSpeakerKey, normalizeSpeakerName, renameSpeakerInUnits, sortSpeakersByName, upsertSpeaker } from './speakerUtils';

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

describe('speakerUtils', () => {
  it('normalizes speaker name', () => {
    expect(normalizeSpeakerName(' Alice ')).toBe('Alice');
    expect(normalizeSpeakerName(undefined)).toBe('');
  });

  it('builds unit speaker key from speakerId first and falls back to speaker name', () => {
    expect(getUnitSpeakerKey({ speakerId: 'spk-1', speaker: 'Alice' } as LayerUnitDocType)).toBe('spk-1');
    expect(getUnitSpeakerKey({ speakerId: '', speaker: ' 访客 ' } as LayerUnitDocType)).toBe('');
    expect(getUnitSpeakerKey({ speakerId: '', speaker: '  ' } as LayerUnitDocType)).toBe('');
  });

  it('sorts speakers by localized name and upsert keeps list sorted', () => {
    const list = [
      makeSpeaker({ id: 'spk-2', name: '张三' }),
      makeSpeaker({ id: 'spk-1', name: 'Alice' }),
    ];
    const sorted = sortSpeakersByName(list);
    expect(sorted.map((item) => item.id)).toEqual(['spk-2', 'spk-1']);

    const upserted = upsertSpeaker(sorted, makeSpeaker({ id: 'spk-1', name: 'Bob' }));
    expect(upserted.find((item) => item.id === 'spk-1')?.name).toBe('Bob');
    expect(upserted.map((item) => item.name)).toEqual(['张三', 'Bob']);
  });

  it('builds speaker visual map and filter options with counts', () => {
    const speakers = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];
    const units = [
      makeUnit({ id: 'utt-1', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ id: 'utt-2', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ id: 'utt-3', speaker: '访客' }),
    ];

    const visualMap = buildSpeakerVisualMap(units, speakers);
    expect(visualMap['utt-1']?.name).toBe('Alice');
    expect(visualMap['utt-3']).toBeUndefined();
    expect(visualMap['utt-1']?.color).toBeTruthy();

    const filterOptions = buildSpeakerFilterOptions(units, visualMap);
    expect(filterOptions[0]?.key).toBe('spk-1');
    expect(filterOptions[0]?.count).toBe(2);
    expect(filterOptions).toHaveLength(1);
  });

  it('builds speaker visuals and filter options from generic unit assignments', () => {
    const speakers = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];
    const assignments = [
      { unitId: 'seg-1', speakerKey: 'spk-1' },
      { unitId: 'seg-2', speakerKey: 'spk-1' },
      { unitId: 'seg-4', speakerKey: 'unknown-speaker' },
    ];

    const visualMap = buildSpeakerVisualMapFromKeys(assignments, speakers);
    expect(visualMap['seg-1']?.name).toBe('Alice');
    expect(visualMap['seg-4']).toBeUndefined();

    const filterOptions = buildSpeakerFilterOptionsFromKeys(assignments, visualMap);
    expect(filterOptions[0]?.key).toBe('spk-1');
    expect(filterOptions[0]?.count).toBe(2);
  });

  it('resolves speaker display names from entity keys and unknown speaker', () => {
    const speakerById = new Map<string, SpeakerDocType>([['spk-1', makeSpeaker({ id: 'spk-1', name: 'Alice' })]]);

    expect(getSpeakerDisplayNameByKey('spk-1', speakerById)).toBe('Alice');
    expect(getSpeakerDisplayNameByKey('unknown-speaker', speakerById)).toBe('未命名说话人');
  });

  it('builds selected speaker summary for empty/none/single/multiple speaker selections', () => {
    const speakerOptions = [makeSpeaker({ id: 'spk-1', name: 'Alice' })];

    expect(buildSelectedSpeakerSummary([], speakerOptions)).toBe('未选择句段');
    expect(buildSelectedSpeakerSummary([makeUnit({ speakerId: '', speaker: '' })], speakerOptions)).toBe('当前句段均未标注说话人');
    expect(buildSelectedSpeakerSummary([
      makeUnit({ speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ speakerId: 'spk-1', speaker: 'Alice' }),
    ], speakerOptions)).toBe('当前统一说话人：Alice');
    expect(buildSelectedSpeakerSummary([
      makeUnit({ speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ speakerId: 'spk-2', speaker: '访客' }),
    ], speakerOptions)).toBe('当前涉及 2 位说话人');
  });

  it('applies speaker assignment and supports clearing assignment', () => {
    const units = [
      makeUnit({ id: 'utt-1', speakerId: 'old', speaker: 'Old' }),
      makeUnit({ id: 'utt-2', speakerId: 'old', speaker: 'Old' }),
    ];
    const assigned = applySpeakerAssignmentToUnits(units, ['utt-2'], { id: 'spk-1', name: 'Alice' });
    expect(assigned[0]?.speakerId).toBe('old');
    expect(assigned[1]?.speakerId).toBe('spk-1');
    expect(assigned[1]?.speaker).toBe('Alice');

    const cleared = applySpeakerAssignmentToUnits(assigned, ['utt-2']);
    expect('speakerId' in (cleared[1] as unknown as Record<string, unknown>)).toBe(false);
    expect('speaker' in (cleared[1] as unknown as Record<string, unknown>)).toBe(false);
  });

  it('renames assigned speaker display name in units', () => {
    const units = [
      makeUnit({ id: 'utt-1', speakerId: 'spk-1', speaker: 'Alice' }),
      makeUnit({ id: 'utt-2', speakerId: 'spk-2', speaker: 'Bob' }),
    ];
    const renamed = renameSpeakerInUnits(units, 'spk-1', 'Alicia');
    expect(renamed[0]?.speaker).toBe('Alicia');
    expect(renamed[1]?.speaker).toBe('Bob');
  });
});