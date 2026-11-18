import { describe, expect, it } from 'vitest';
import { createTranscriptionAiReadModelAccessors } from './transcriptionAiReadModelAccessors';

describe('readTokenGloss (#531)', () => {
  it('keeps searching later units instead of treating a missing token as an empty gloss', () => {
    const accessors = createTranscriptionAiReadModelAccessors({
      getUnitDocById: (id) =>
        id === 'u1'
          ? { id: 'u1', words: [{ id: 'other', gloss: { eng: 'other' } }] }
          : { id: 'u2', words: [{ id: 'target', gloss: { eng: 'original' } }] },
      segmentTargetScopeUnits: [],
      getUnitTextForLayer: () => '',
      allUnitRows: [{ id: 'u1' }, { id: 'u2' }],
    });

    expect(accessors.readTokenGloss('target', 'eng')).toBe('original');
  });

  it('returns null only after the token is found without that gloss', () => {
    const accessors = createTranscriptionAiReadModelAccessors({
      getUnitDocById: () => ({ id: 'u1', words: [{ id: 'target', gloss: { fra: 'bonjour' } }] }),
      segmentTargetScopeUnits: [],
      getUnitTextForLayer: () => '',
      allUnitRows: [{ id: 'u1' }],
    });

    expect(accessors.readTokenGloss('target', 'eng')).toBeNull();
  });
});
