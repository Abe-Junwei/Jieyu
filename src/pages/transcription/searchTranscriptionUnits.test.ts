import { describe, expect, it } from 'vitest';
import { parseCharacterVariantLines } from '../annotation/annotationCharacterVariants';
import { searchTranscriptionUnits } from './searchTranscriptionUnits';

const rows = [
  { id: 'a', surface: 'cafe\u0301 sentence', startTime: 1, endTime: 2, ungrammatical: false },
  { id: 'b', surface: 'other sentence', startTime: 3, endTime: 4, ungrammatical: true },
];

describe('searchTranscriptionUnits', () => {
  it('matches a composed form against a decomposed query and keeps the sentence as the title', () => {
    const found = searchTranscriptionUnits(rows, {
      query: 'é',
      mode: 'word',
      excludeUngrammatical: false,
      wordFormsByUnit: new Map([['a', ['café']]]),
      morphemeFormsByUnit: new Map(),
    });
    expect(found).toEqual([
      { unitId: 'a', sentence: 'cafe\u0301 sentence', match: 'café', startTime: 1, endTime: 2 },
    ]);
  });

  it('does not treat a sentence hit as a morpheme hit', () => {
    const found = searchTranscriptionUnits(rows, {
      query: 'sentence',
      mode: 'morpheme',
      excludeUngrammatical: false,
      wordFormsByUnit: new Map([['a', ['café']]]),
      morphemeFormsByUnit: new Map([['a', ['tsa']]]),
    });
    expect(found).toEqual([]);
  });

  it('treats registered character variants as the same word and leaves unregistered ones apart', () => {
    const wordFormsByUnit = new Map([
      ['a', ['aʔ']],
      ['b', ["a'"]],
    ]);
    const shared = {
      query: "a'",
      mode: 'word' as const,
      excludeUngrammatical: false,
      wordFormsByUnit,
      morphemeFormsByUnit: new Map<string, string[]>(),
    };
    expect(searchTranscriptionUnits(rows, shared).map((hit) => hit.unitId)).toEqual(['b']);
    expect(
      searchTranscriptionUnits(rows, {
        ...shared,
        query: 'aʔ',
        variantGroups: parseCharacterVariantLines("ʔ='"),
      }).map((hit) => hit.unitId),
    ).toEqual(['a', 'b']);
  });

  it('drops ungrammatical sentences and returns nothing for an empty query', () => {
    expect(
      searchTranscriptionUnits(rows, {
        query: 'sentence',
        mode: 'surface',
        excludeUngrammatical: true,
        wordFormsByUnit: new Map(),
        morphemeFormsByUnit: new Map(),
      }).map((hit) => hit.unitId),
    ).toEqual(['a']);
    expect(
      searchTranscriptionUnits(rows, {
        query: '   ',
        mode: 'surface',
        excludeUngrammatical: false,
        wordFormsByUnit: new Map(),
        morphemeFormsByUnit: new Map(),
      }),
    ).toEqual([]);
  });
});
