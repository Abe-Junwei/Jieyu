import { describe, expect, it } from 'vitest';
import { filterAnnotationUnits } from './annotationRowSearch';

const rows = [
  { id: 'a', surface: 'ŋa tɕhi', ungrammatical: false },
  { id: 'b', surface: 'bad sentence', ungrammatical: true },
];

describe('filterAnnotationUnits', () => {
  it('searches words without matching a sentence that only shares a translation', () => {
    const found = filterAnnotationUnits(rows, {
      query: 'tɕhi',
      mode: 'word',
      excludeUngrammatical: false,
      wordFormsByUnit: new Map([['a', ['ŋa', 'tɕhi']]]),
      morphemeFormsByUnit: new Map(),
    });
    expect(found.map((row) => row.id)).toEqual(['a']);
  });

  it('matches NFC forms when the query is decomposed', () => {
    const found = filterAnnotationUnits(
      [{ id: 'c', surface: 'cafe\u0301', ungrammatical: false }],
      {
        query: 'é',
        mode: 'surface',
        excludeUngrammatical: false,
        wordFormsByUnit: new Map(),
        morphemeFormsByUnit: new Map(),
      },
    );
    expect(found.map((row) => row.id)).toEqual(['c']);
  });

  it('drops ungrammatical sentences when asked', () => {
    const found = filterAnnotationUnits(rows, {
      query: '',
      mode: 'surface',
      excludeUngrammatical: true,
      wordFormsByUnit: new Map(),
      morphemeFormsByUnit: new Map(),
    });
    expect(found.map((row) => row.id)).toEqual(['a']);
  });
});
