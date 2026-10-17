import { describe, expect, it } from 'vitest';
import { buildLocalContextToolGuide } from '../chat/localContextTools';
import {
  concordanceKwic,
  findCounterexamples,
  queryMorphemeParadigm,
  type AnalysisMorpheme,
} from './corpusAnalysisQueries';

const rows: AnalysisMorpheme[] = [
  {
    id: 'm1',
    unitId: 'u1',
    tokenId: 't1',
    tokenIndex: 0,
    morphemeIndex: 0,
    tokenPos: 'v',
    form: 'ka',
    gloss: 'go',
  },
  {
    id: 'm2',
    unitId: 'u1',
    tokenId: 't1',
    tokenIndex: 0,
    morphemeIndex: 1,
    tokenPos: 'v',
    form: '-s',
    gloss: 'PST',
  },
  {
    id: 'm3',
    unitId: 'u2',
    tokenId: 't2',
    tokenIndex: 0,
    morphemeIndex: 0,
    tokenPos: 'v',
    form: 'ka',
    gloss: 'go',
  },
  {
    id: 'm4',
    unitId: 'u3',
    tokenId: 't3',
    tokenIndex: 0,
    morphemeIndex: 0,
    tokenPos: 'n',
    form: 'na',
    gloss: 'house',
  },
];

describe('corpus analysis tool guide', () => {
  it('hides the three tools unless the flag is on', () => {
    expect(buildLocalContextToolGuide(false)).not.toContain('concordance_kwic');
    expect(buildLocalContextToolGuide(true)).toContain('find_counterexamples');
  });
});

describe('concordanceKwic', () => {
  it('returns neighbors and unitId for a gloss hit', () => {
    const result = concordanceKwic(rows, { gloss: 'PST' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hits).toEqual([
      {
        unitId: 'u1',
        morphemeId: 'm2',
        left: { form: 'ka', gloss: 'go' },
        target: { form: '-s', gloss: 'PST' },
        right: null,
      },
    ]);
  });

  it('rejects an empty query', () => {
    expect(concordanceKwic(rows, {}).ok).toBe(false);
  });
});

describe('queryMorphemeParadigm', () => {
  it('counts adjacent glosses on tokens of the given pos', () => {
    const result = queryMorphemeParadigm(rows, { pos: 'v' });
    expect(result).toEqual({
      ok: true,
      pos: 'v',
      tokenCount: 2,
      adjacent: [
        {
          leftGloss: 'go',
          rightGloss: 'PST',
          count: 1,
          examples: [{ morphemeId: 'm1', unitId: 'u1', form: 'ka--s', gloss: 'go-PST' }],
        },
      ],
    });
  });
});

describe('findCounterexamples', () => {
  it('lists units in scope that lack the gloss', () => {
    const result = findCounterexamples(rows, { gloss: 'PST', pos: 'v', expect: 'present' });
    expect(result).toEqual({
      ok: true,
      gloss: 'PST',
      expect: 'present',
      matchCount: 1,
      counterexampleCount: 1,
      counterexampleUnitIds: ['u2'],
    });
  });

  it('ignores the gloss on tokens outside the pos scope', () => {
    const mixed: AnalysisMorpheme[] = [
      { ...rows[2]!, id: 'm5', unitId: 'u4', tokenId: 't4' },
      { ...rows[3]!, id: 'm6', unitId: 'u4', tokenId: 't5', gloss: 'PST' },
    ];
    const result = findCounterexamples(mixed, { gloss: 'PST', pos: 'v', expect: 'present' });
    expect(result).toMatchObject({ matchCount: 0, counterexampleUnitIds: ['u4'] });
  });
});
