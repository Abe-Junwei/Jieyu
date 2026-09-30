import { describe, expect, it } from 'vitest';
import {
  normalizeProjectLanguageIds,
  projectLanguageIdsForRole,
  readProjectLanguageLists,
} from './projectLanguageLists';

describe('projectLanguageLists', () => {
  it('keeps the first valid code and drops duplicates', () => {
    expect(normalizeProjectLanguageIds([' ENG ', 'eng', 'zz', 'bod'])).toEqual(['eng', 'bod']);
  });

  it('reads a legacy project as one object language and no working languages', () => {
    expect(readProjectLanguageLists({ primaryLanguageId: 'bod' })).toEqual({
      objectLanguageIds: ['bod'],
      workingLanguageIds: [],
    });
  });

  it('prefers the stored object-language list over the legacy primary id', () => {
    expect(
      readProjectLanguageLists({
        primaryLanguageId: 'eng',
        objectLanguageIds: ['bod', 'khb'],
        workingLanguageIds: ['cmn', 'eng'],
      }),
    ).toEqual({
      objectLanguageIds: ['bod', 'khb'],
      workingLanguageIds: ['cmn', 'eng'],
    });
  });

  it('joins both lists for a project-wide choice', () => {
    expect(
      projectLanguageIdsForRole(
        { objectLanguageIds: ['bod'], workingLanguageIds: ['cmn', 'bod'] },
        'project',
      ),
    ).toEqual(['bod', 'cmn']);
  });
});
