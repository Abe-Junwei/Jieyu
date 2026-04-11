/**
 * 查询当前项目中实际使用的语言 ID 集合（来源：层定义）
 * Query the set of language IDs actually used in the current project (source: layer definitions)
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinguisticService } from '../services/LinguisticService';

const EMPTY_IDS: readonly string[] = [];
const PROJECT_LANGUAGE_IDS_QUERY_KEY = 'projectLanguageIds';

export function projectLanguageIdsQueryKey() {
  return [PROJECT_LANGUAGE_IDS_QUERY_KEY] as const;
}

/** 项目语言集合变更后刷新缓存 | Invalidate cache after project language set changes */
export function useInvalidateProjectLanguageIds() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: projectLanguageIdsQueryKey() });
  }, [queryClient]);
}

export function useProjectLanguageIds(): {
  projectLanguageIds: readonly string[];
  loading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: projectLanguageIdsQueryKey(),
    queryFn: () => LinguisticService.listDistinctProjectLanguageIds(),
  });

  return {
    projectLanguageIds: data ?? EMPTY_IDS,
    loading: isLoading,
  };
}
