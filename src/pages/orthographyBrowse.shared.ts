import type { ListOrthographyRecordsSelector } from '../types/orthographyListSelector.types';

/**
 * 工作台页面语言搜索的统一查询上限 | Shared search limit for workspace-level language catalog search
 */
export const WORKSPACE_LANGUAGE_SEARCH_LIMIT = 50;

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
    // 搜索模式下不注入当前选中 ID，避免固定项混入搜索结果 | Do NOT inject selected ID in search mode to keep results clean
    return {
      includeBuiltIns: true,
      searchText: input.state.normalizedSearchText,
      ...(input.state.shouldLoadProjectSubset ? { languageIds: input.state.browseLanguageIds } : {}),
      ...(normalizedSearchLanguageIds.length > 0 ? { searchLanguageIds: normalizedSearchLanguageIds } : {}),
    };
  }

  if (input.state.shouldLoadProjectSubset) {
    // 项目子集浏览下不注入当前选中 ID，避免固定项混入列表 | Do NOT inject selected ID in project-subset browse to keep list clean
    return {
      includeBuiltIns: true,
      languageIds: input.state.browseLanguageIds,
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