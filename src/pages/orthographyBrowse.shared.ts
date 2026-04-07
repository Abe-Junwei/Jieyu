import type { ListOrthographyRecordsSelector } from '../services/LinguisticService.orthography';

export type OrthographyBrowseState = {
  browseLanguageIds: string[];
  normalizedSearchText: string;
  shouldLoadProjectSubset: boolean;
  shouldBrowseFullCatalog: boolean;
  showUnscopedIdleState: boolean;
};

function normalizeDistinctValues(values: readonly string[]): string[] {
  return Array.from(new Set(
    values
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

export function buildOrthographyBrowseState(input: {
  projectLanguageIds: readonly string[];
  projectOnly: boolean;
  selectedOrthographyId: string;
  searchText: string;
  browseAllWithoutProject: boolean;
}): OrthographyBrowseState {
  const normalizedProjectLanguageIds = normalizeDistinctValues(input.projectLanguageIds);
  const browseLanguageIds = input.projectOnly
    ? normalizedProjectLanguageIds
    : [];
  const normalizedSelectedOrthographyId = input.selectedOrthographyId.trim();
  const normalizedSearchText = input.searchText.trim();
  const shouldLoadProjectSubset = input.projectOnly && browseLanguageIds.length > 0;
  const shouldBrowseFullCatalog = !input.projectOnly
    || (normalizedProjectLanguageIds.length === 0 && input.browseAllWithoutProject);
  const showUnscopedIdleState = normalizedProjectLanguageIds.length === 0
    && !normalizedSelectedOrthographyId
    && !normalizedSearchText
    && !input.browseAllWithoutProject;

  return {
    browseLanguageIds,
    normalizedSearchText,
    shouldLoadProjectSubset,
    shouldBrowseFullCatalog,
    showUnscopedIdleState,
  };
}

export function buildOrthographyBrowseSelector(input: {
  selectedOrthographyId: string;
  searchLanguageIds?: readonly string[];
  state: Pick<OrthographyBrowseState, 'browseLanguageIds' | 'normalizedSearchText' | 'shouldLoadProjectSubset' | 'shouldBrowseFullCatalog'>;
}): ListOrthographyRecordsSelector | null {
  const normalizedSelectedOrthographyId = input.selectedOrthographyId.trim();
  const normalizedSearchLanguageIds = input.searchLanguageIds
    ? normalizeDistinctValues(input.searchLanguageIds)
    : [];

  if (
    !input.state.normalizedSearchText
    && !input.state.shouldLoadProjectSubset
    && !input.state.shouldBrowseFullCatalog
    && !normalizedSelectedOrthographyId
  ) {
    return null;
  }

  if (input.state.normalizedSearchText) {
    return {
      includeBuiltIns: true,
      searchText: input.state.normalizedSearchText,
      ...(input.state.shouldLoadProjectSubset ? { languageIds: input.state.browseLanguageIds } : {}),
      ...(normalizedSelectedOrthographyId ? { orthographyIds: [normalizedSelectedOrthographyId] } : {}),
      ...(normalizedSearchLanguageIds.length > 0 ? { searchLanguageIds: normalizedSearchLanguageIds } : {}),
    };
  }

  if (input.state.shouldLoadProjectSubset) {
    return {
      includeBuiltIns: true,
      languageIds: input.state.browseLanguageIds,
      ...(normalizedSelectedOrthographyId ? { orthographyIds: [normalizedSelectedOrthographyId] } : {}),
    };
  }

  if (input.state.shouldBrowseFullCatalog) {
    return { includeBuiltIns: true };
  }

  return {
    includeBuiltIns: true,
    orthographyIds: [normalizedSelectedOrthographyId],
  };
}