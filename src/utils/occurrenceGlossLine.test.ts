import { describe, expect, it } from 'vitest';
import type { UnitTokenDocType } from '../types/jieyuDbDocTypes';
import { formatOccurrenceGlossLine, occurrenceGlossByUnitId } from './occurrenceGlossLine';

const now = '2026-09-29T00:00:00.000Z';

function token(
  partial: Partial<UnitTokenDocType> & Pick<UnitTokenDocType, 'id'>,
): UnitTokenDocType {
  return {
    textId: 'text-1',
    unitId: 'utt-1',
    form: { default: 'a' },
    tokenIndex: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('formatOccurrenceGlossLine', () => {
  it('joins pos and the layer-language gloss without touching the baseline', () => {
    expect(
      formatOccurrenceGlossLine(
        [
          token({
            id: 'b',
            tokenIndex: 1,
            pos: 'n',
            gloss: { default: 'dog', bod: 'khyi' },
          }),
          token({
            id: 'a',
            tokenIndex: 0,
            gloss: { bod: 'nga' },
          }),
        ],
        'bod',
      ),
    ).toBe('nga · n khyi');
  });

  it('groups lines by unit', () => {
    expect(
      occurrenceGlossByUnitId([
        token({ id: 'a', unitId: 'utt-1', pos: 'n', gloss: { default: 'dog' } }),
        token({ id: 'b', unitId: 'utt-2', gloss: { default: '' } }),
      ]),
    ).toEqual({ 'utt-1': 'n dog' });
  });
});
