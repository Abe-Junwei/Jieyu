/**
 * 查询当前项目中实际使用的语言 ID 集合（来源：层定义）
 * Query the set of language IDs actually used in the current project (source: layer definitions)
 */
import { useEffect, useState } from 'react';
import { LinguisticService } from '../services/LinguisticService';

export function useProjectLanguageIds(): {
  projectLanguageIds: readonly string[];
  loading: boolean;
} {
  const [projectLanguageIds, setProjectLanguageIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void LinguisticService.listDistinctProjectLanguageIds()
      .then((ids) => {
        if (!cancelled) {
          setProjectLanguageIds(ids);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectLanguageIds([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { projectLanguageIds, loading };
}
