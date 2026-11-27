import { describe, expect, it } from 'vitest';
import {
  clearSpeakerFilter,
  EMPTY_SPEAKER_FILTER,
  speakerFilterActive,
  speakerFilterHeaderMeta,
  speakerFilterRows,
  toggleSpeakerFilterId,
  toggleUnassignedFilter,
  unitVisibleInSpeakerFilter,
  spanAffectedFromUnits,
  viewScopeFromSpeakerFilter,
  writeScopeArgs,
} from './desktopTranscriptionSpeakerFilter';

describe('desktopTranscriptionSpeakerFilter', () => {
  it('treats an empty filter as all, and builds a speakers viewScope when checked', () => {
    expect(speakerFilterActive(EMPTY_SPEAKER_FILTER)).toBe(false);
    expect(viewScopeFromSpeakerFilter('ms', EMPTY_SPEAKER_FILTER)).toEqual({
      manuscriptId: 'ms',
      kind: 'all',
    });
    const filtered = toggleUnassignedFilter(toggleSpeakerFilterId(EMPTY_SPEAKER_FILTER, 'a'));
    expect(speakerFilterActive(filtered)).toBe(true);
    expect(viewScopeFromSpeakerFilter('ms', filtered)).toEqual({
      manuscriptId: 'ms',
      kind: 'speakers',
      speakerIds: ['a'],
      includeUnassigned: true,
    });
    expect(clearSpeakerFilter()).toEqual(EMPTY_SPEAKER_FILTER);
  });

  it('hides units outside the checked set', () => {
    const state = toggleSpeakerFilterId(EMPTY_SPEAKER_FILTER, 'a');
    expect(unitVisibleInSpeakerFilter('a', state)).toBe(true);
    expect(unitVisibleInSpeakerFilter('b', state)).toBe(false);
    expect(unitVisibleInSpeakerFilter(null, state)).toBe(false);
    expect(unitVisibleInSpeakerFilter(null, toggleUnassignedFilter(state))).toBe(true);
  });

  it('lists speakers with counts and an unassigned row', () => {
    const rows = speakerFilterRows(
      [
        { id: 'a', name: '阿佳' },
        { id: 'b', name: '扎西' },
      ],
      [{ speakerId: 'a' }, { speakerId: 'a' }, { speakerId: null }, { speakerId: 'b' }],
      '未归属',
    );
    expect(rows).toEqual([
      { id: 'a', name: '阿佳', count: 2 },
      { id: 'b', name: '扎西', count: 1 },
      { id: '', name: '未归属', count: 1 },
    ]);
    expect(
      speakerFilterHeaderMeta(EMPTY_SPEAKER_FILTER, 4, {
        all: (n) => `全部 · ${n}`,
        filtering: (n) => `筛选 · ${n}`,
      }),
    ).toBe('全部 · 4');
  });

  it('builds writeScopeArgs and span-affected ids', () => {
    expect(writeScopeArgs(null, EMPTY_SPEAKER_FILTER, ['u'])).toEqual({});
    expect(writeScopeArgs('ms', EMPTY_SPEAKER_FILTER, ['u'])).toEqual({
      viewScope: { manuscriptId: 'ms', kind: 'all' },
      expectedAffectedUnitIds: ['u'],
    });
    expect(
      spanAffectedFromUnits(
        [
          { id: 'p', parentUnitId: null },
          { id: 'c1', parentUnitId: 'p' },
          { id: 'c2', parentUnitId: 'c1' },
          { id: 'c1', parentUnitId: 'p' }, // projected again on an associated text layer
          { id: 'p', parentUnitId: 'c2' }, // malformed cycle must terminate
        ],
        'p',
      ),
    ).toEqual(['p', 'c1', 'c2']);
  });
});
