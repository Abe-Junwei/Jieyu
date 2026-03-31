import { useEffect, useMemo, useState } from 'react';
import { getDb, type OrthographyDocType } from '../db';

/**
 * 按语言加载正字法配置 | Load orthographies by language ids
 */
export function useOrthographies(languageIds: readonly string[]): OrthographyDocType[] {
  const [orthographies, setOrthographies] = useState<OrthographyDocType[]>([]);
  const normalizedLanguageIds = useMemo(
    () => Array.from(new Set(languageIds.filter(Boolean))).sort(),
    [languageIds.join('\u0000')],
  );

  useEffect(() => {
    let disposed = false;

    if (normalizedLanguageIds.length === 0) {
      setOrthographies([]);
      return () => {
        disposed = true;
      };
    }

    void (async () => {
      const db = await getDb();
      const rows = await db.dexie.orthographies.where('languageId').anyOf(normalizedLanguageIds).toArray();
      if (!disposed) {
        setOrthographies(rows);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [normalizedLanguageIds]);

  return orthographies;
}