import { useEffect, useMemo, useState } from 'react';
import { getDb, type OrthographyDocType } from '../db';
import { listBuiltInOrthographies } from '../data/builtInOrthographies';

type OrthographyCatalogSource = NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['catalogSource']>;
type OrthographyReviewStatus = NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['reviewStatus']>;
type OrthographyCatalogPriority = NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['priority']>;

const ORTHOGRAPHY_LANGUAGE_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  cmn: ['zho'],
};

function normalizeLanguageIds(languageIds: readonly string[]): string[] {
  return Array.from(
    new Set(
      languageIds
        .map((value) => value.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
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
    case 'verified-primary': return 0;
    case 'verified-secondary': return 1;
    case 'needs-review': return 2;
    case 'historical': return 3;
    case 'legacy': return 4;
    case 'experimental': return 5;
    default: return 6;
  }
}

function getCatalogSourceRank(source: OrthographyCatalogSource | undefined): number {
  switch (source) {
    case 'user': return 0;
    case 'built-in-reviewed': return 1;
    case 'built-in-generated': return 2;
    default: return 0;
  }
}

function getPriorityRank(priority: OrthographyCatalogPriority | undefined): number {
  return priority === 'secondary' ? 1 : 0;
}

function resolveOrthographyDisplayName(orthography: OrthographyDocType): string {
  return orthography.name.eng
    ?? orthography.name.zho
    ?? orthography.name.en
    ?? orthography.name.zh
    ?? orthography.abbreviation
    ?? orthography.id;
}

function sortOrthographyRows(items: OrthographyDocType[]): OrthographyDocType[] {
  return [...items].sort((left, right) => {
    const sourceRankDelta = getCatalogSourceRank(left.catalogMetadata?.catalogSource) - getCatalogSourceRank(right.catalogMetadata?.catalogSource);
    if (sourceRankDelta !== 0) return sourceRankDelta;

    const reviewRankDelta = getReviewStatusRank(left.catalogMetadata?.reviewStatus) - getReviewStatusRank(right.catalogMetadata?.reviewStatus);
    if (reviewRankDelta !== 0) return reviewRankDelta;

    const priorityRankDelta = getPriorityRank(left.catalogMetadata?.priority) - getPriorityRank(right.catalogMetadata?.priority);
    if (priorityRankDelta !== 0) return priorityRankDelta;

    const nameDelta = resolveOrthographyDisplayName(left).localeCompare(resolveOrthographyDisplayName(right), 'en');
    if (nameDelta !== 0) return nameDelta;

    return left.id.localeCompare(right.id, 'en');
  });
}

function mergeOrthographyRows(builtInRows: OrthographyDocType[], dbRows: OrthographyDocType[]): OrthographyDocType[] {
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
  const normalizedLanguageIds = useMemo(
    () => normalizeLanguageIds(languageIds),
    [languageIds.join('\u0000')],
  );
  const resolvedLanguageIds = useMemo(
    () => expandOrthographyLanguageIds(normalizedLanguageIds),
    [normalizedLanguageIds],
  );

  useEffect(() => {
    let disposed = false;

    if (resolvedLanguageIds.length === 0) {
      setOrthographies([]);
      return () => {
        disposed = true;
      };
    }

    // Clear stale results immediately so callers cannot submit a previous language's orthography
    // while the next query is still loading.
    setOrthographies([]);

    void (async () => {
      const [builtInRows, rows] = await Promise.all([
        listBuiltInOrthographies(resolvedLanguageIds),
        (async () => {
          const db = await getDb();
          return db.dexie.orthographies.where('languageId').anyOf(resolvedLanguageIds).toArray();
        })(),
      ]);
      if (!disposed) {
        setOrthographies(mergeOrthographyRows(builtInRows, rows));
      }
    })();

    return () => {
      disposed = true;
    };
  }, [resolvedLanguageIds]);

  return orthographies;
}
