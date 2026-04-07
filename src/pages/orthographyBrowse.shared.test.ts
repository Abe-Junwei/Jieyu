import { describe, expect, it } from 'vitest';
import {
  buildOrthographyBrowseSelector,
  buildOrthographyBrowseState,
} from './orthographyBrowse.shared';

describe('orthographyBrowse shared helpers', () => {
  it('stays idle when there is no project scope, no search text, and no selected orthography', () => {
    const state = buildOrthographyBrowseState({
      projectLanguageIds: [],
      projectOnly: true,
      selectedOrthographyId: '',
      searchText: '   ',
      browseAllWithoutProject: false,
    });

    expect(state.showUnscopedIdleState).toBe(true);
    expect(buildOrthographyBrowseSelector({
      selectedOrthographyId: '',
      state,
    })).toBeNull();
  });

  it('uses project languages plus explicit selected orthography in project-only mode', () => {
    const state = buildOrthographyBrowseState({
      projectLanguageIds: ['eng', 'eng', 'zho'],
      projectOnly: true,
      selectedOrthographyId: 'orth-alt',
      searchText: '',
      browseAllWithoutProject: false,
    });

    expect(buildOrthographyBrowseSelector({
      selectedOrthographyId: 'orth-alt',
      state,
    })).toEqual({
      includeBuiltIns: true,
      languageIds: ['eng', 'zho'],
      orthographyIds: ['orth-alt'],
    });
  });

  it('adds searchLanguageIds only for search-backed loads', () => {
    const state = buildOrthographyBrowseState({
      projectLanguageIds: ['eng'],
      projectOnly: true,
      selectedOrthographyId: 'orth-source',
      searchText: 'English',
      browseAllWithoutProject: false,
    });

    expect(buildOrthographyBrowseSelector({
      selectedOrthographyId: 'orth-source',
      searchLanguageIds: ['eng', 'eng'],
      state,
    })).toEqual({
      includeBuiltIns: true,
      languageIds: ['eng'],
      orthographyIds: ['orth-source'],
      searchLanguageIds: ['eng'],
      searchText: 'English',
    });
  });

  it('falls back to full built-in browsing when browse-all is enabled without project languages', () => {
    const state = buildOrthographyBrowseState({
      projectLanguageIds: [],
      projectOnly: true,
      selectedOrthographyId: '',
      searchText: '',
      browseAllWithoutProject: true,
    });

    expect(buildOrthographyBrowseSelector({
      selectedOrthographyId: '',
      state,
    })).toEqual({ includeBuiltIns: true });
  });

  it('switches to full catalog browsing when project scope is explicitly disabled', () => {
    const state = buildOrthographyBrowseState({
      projectLanguageIds: ['eng'],
      projectOnly: false,
      selectedOrthographyId: 'orth-source',
      searchText: '',
      browseAllWithoutProject: false,
    });

    expect(state.showUnscopedIdleState).toBe(false);
    expect(buildOrthographyBrowseSelector({
      selectedOrthographyId: 'orth-source',
      state,
    })).toEqual({ includeBuiltIns: true });
  });
});