/**
 * 查询当前项目中实际使用的语言 ID 集合（来源：层定义）
 * Query the set of language IDs actually used in the current project (source: layer definitions)
 */
import { useQuery } from '@tanstack/react-query';
import { LinguisticService } from '../services/LinguisticService';

const EMPTY_IDS: readonly string[] = [];
const PROJECT_LANGUAGE_IDS_QUERY_KEY = 'projectLanguageIds';

function projectLanguageIdsQueryKey() {
  return [PROJECT_LANGUAGE_IDS_QUERY_KEY] as const;
}

export function useProjectLanguageIds(): {
  projectLanguageIds: readonly string[];
  loading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: projectLanguageIdsQueryKey(),
    queryFn: () => LinguisticService.layers.listDistinctProjectLanguageIds(),
  });

  return {
    projectLanguageIds: data ?? EMPTY_IDS,
    loading: isLoading,
  };
}
