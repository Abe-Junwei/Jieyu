import { isKnownIso639_3Code } from './langMapping';

export type ProjectLanguageLists = {
  objectLanguageIds: readonly string[];
  workingLanguageIds: readonly string[];
};

export const EMPTY_PROJECT_LANGUAGE_LISTS: ProjectLanguageLists = {
  objectLanguageIds: [],
  workingLanguageIds: [],
};

export function normalizeProjectLanguageIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim().toLowerCase();
    // 'und'（undetermined）是未选语言时的占位默认值，不构成真实语言约束 | 'und' is a placeholder, not a real language constraint
    if (id.length === 0 || id === 'und' || seen.has(id) || !isKnownIso639_3Code(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizeProjectLanguageIds(
    value.filter((item): item is string => typeof item === 'string'),
  );
}

export function readProjectLanguageLists(
  metadata: Record<string, unknown> | null | undefined,
): ProjectLanguageLists {
  const listed = readIdList(metadata?.objectLanguageIds);
  const primary = typeof metadata?.primaryLanguageId === 'string' ? metadata.primaryLanguageId : '';
  const objectLanguageIds =
    listed.length > 0 ? listed : normalizeProjectLanguageIds(primary.length > 0 ? [primary] : []);
  return {
    objectLanguageIds,
    workingLanguageIds: readIdList(metadata?.workingLanguageIds),
  };
}

export function projectLanguageIdsForRole(
  lists: ProjectLanguageLists,
  role: 'object' | 'working' | 'project',
): readonly string[] {
  if (role === 'object') return lists.objectLanguageIds;
  if (role === 'working') return lists.workingLanguageIds;
  return normalizeProjectLanguageIds([...lists.objectLanguageIds, ...lists.workingLanguageIds]);
}
