import { useEffect, useMemo, useState } from 'react';
import { getDb, type OrthographyDocType } from '../../db';
import { listBuiltInOrthographies } from '../../data/builtInOrthographies';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';

type OrthographyCatalogSource = NonNullable<
  NonNullable<OrthographyDocType['catalogMetadata']>['catalogSource']
>;
type OrthographyReviewStatus = NonNullable<
  NonNullable<OrthographyDocType['catalogMetadata']>['reviewStatus']
>;
type OrthographyCatalogPriority = NonNullable<
  NonNullable<OrthographyDocType['catalogMetadata']>['priority']
>;

const ORTHOGRAPHY_LANGUAGE_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  cmn: ['zho'],
};

function normalizeLanguageIds(languageIds: readonly string[]): string[] {
  return Array.from(
    new Set(languageIds.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean)),
  ).sort();
}

function expandOrthographyLanguageIds(languageIds: readonly string[]): string[] {
  const resolved = new Set(languageIds);
  languageIds.forEach((languageId) => {
    const fallbackIds = ORTHOGRAPHY_LANGUAGE_FALLBACKS[languageId] ?? [];
    fallbackIds.forEach((fallbackId) => {
      const normalizedFallback = fallbackId.trim().toLocaleLowerCase();
      if (normalizedFallback) resolved.add(normalizedFallback);
    });
  });
  return Array.from(resolved).sort();
}

function getReviewStatusRank(status: OrthographyReviewStatus | undefined): number {
  switch (status) {
    case 'verified-primary':
      return 0;
    case 'verified-secondary':
      return 1;
    case 'needs-review':
      return 2;
    case 'historical':
      return 3;
    case 'legacy':
      return 4;
    case 'experimental':
      return 5;
    default:
      return 6;
  }
}

function getCatalogSourceRank(source: OrthographyCatalogSource | undefined): number {
  switch (source) {
    case 'user':
      return 0;
    case 'built-in-reviewed':
      return 1;
    case 'built-in-generated':
      return 2;
    default:
      return 0;
  }
}

function getPriorityRank(priority: OrthographyCatalogPriority | undefined): number {
  return priority === 'secondary' ? 1 : 0;
}

function resolveOrthographyDisplayName(orthography: OrthographyDocType): string {
  return readAnyMultiLangLabel(orthography.name) ?? orthography.abbreviation ?? orthography.id;
}

function sortOrthographyRows(items: OrthographyDocType[]): OrthographyDocType[] {
  return [...items].sort((left, right) => {
    const sourceRankDelta =
      getCatalogSourceRank(left.catalogMetadata?.catalogSource) -
      getCatalogSourceRank(right.catalogMetadata?.catalogSource);
    if (sourceRankDelta !== 0) return sourceRankDelta;

    const reviewRankDelta =
      getReviewStatusRank(left.catalogMetadata?.reviewStatus) -
      getReviewStatusRank(right.catalogMetadata?.reviewStatus);
    if (reviewRankDelta !== 0) return reviewRankDelta;

    const priorityRankDelta =
      getPriorityRank(left.catalogMetadata?.priority) -
      getPriorityRank(right.catalogMetadata?.priority);
    if (priorityRankDelta !== 0) return priorityRankDelta;

    const nameDelta = resolveOrthographyDisplayName(left).localeCompare(
      resolveOrthographyDisplayName(right),
      'en',
    );
    if (nameDelta !== 0) return nameDelta;

    return left.id.localeCompare(right.id, 'en');
  });
}

function mergeOrthographyRows(
  builtInRows: OrthographyDocType[],
  dbRows: OrthographyDocType[],
): OrthographyDocType[] {
  const deduped = new Map<string, OrthographyDocType>();
  [...builtInRows, ...dbRows].forEach((orthography) => {
    deduped.set(orthography.id, orthography);
  });
  return sortOrthographyRows(Array.from(deduped.values()));
}

/**
 * 按语言加载正字法配置 | Load orthographies by language ids
 */
export function useOrthographies(languageIds: readonly string[]): OrthographyDocType[] {
  const [orthographies, setOrthographies] = useState<OrthographyDocType[]>([]);
  // 不在此对 `languageIds` 做 useMemo（其引用常每帧变）；只取规范化后的语义串，下游 memo/effect 仅依赖 primitive。
  // Avoid useMemo on `languageIds` (fresh array refs); downstream hooks depend only on a stable string key.
  const languageIdsKey = normalizeLanguageIds(languageIds).join('\u0000');
  const normalizedLanguageIds = useMemo(() => {
    if (languageIdsKey.length === 0) return [] as string[];
    return languageIdsKey.split('\u0000');
  }, [languageIdsKey]);
  const resolvedLanguageIds = useMemo(
    () => expandOrthographyLanguageIds(normalizedLanguageIds),
    [normalizedLanguageIds],
  );
  /** Effect 只依赖 primitive，避免 `anyOf` 数组引用每帧变导致反复 `setOrthographies([])`。 */
  const resolvedLanguageIdsFetchKey = resolvedLanguageIds.join('\u0000');

  useEffect(() => {
    let disposed = false;

    const idsForQuery =
      resolvedLanguageIdsFetchKey.length === 0 ? [] : resolvedLanguageIdsFetchKey.split('\u0000');

    if (idsForQuery.length === 0) {
      setOrthographies((prev) => (prev.length === 0 ? prev : []));
      return () => {
        disposed = true;
      };
    }

    // Clear stale results immediately so callers cannot submit a previous language's orthography
    // while the next query is still loading.
    setOrthographies([]);

    void (async () => {
      const [builtInRows, rows] = await Promise.all([
        listBuiltInOrthographies(idsForQuery),
        (async () => {
          const db = await getDb();
          return db.dexie.orthographies.where('languageId').anyOf(idsForQuery).toArray();
        })(),
      ]);
      if (!disposed) {
        setOrthographies(mergeOrthographyRows(builtInRows, rows));
      }
    })();

    return () => {
      disposed = true;
    };
  }, [resolvedLanguageIdsFetchKey]);

  return orthographies;
}
