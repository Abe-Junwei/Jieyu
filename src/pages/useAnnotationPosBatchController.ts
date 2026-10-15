import { useCallback, useRef, useState } from 'react';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import {
  collectPosByFormWrites,
  saveAnnotationPosByForm,
  sourceGlossIsDirty,
} from './annotation/saveAnnotationPosByForm';

export type AnnotationPosBatchError = '' | 'dirty' | 'failed' | 'stale';

export function useAnnotationPosBatchController(
  reload: () => Promise<unknown>,
  clearDrafts: (
    tokenIds: readonly string[],
    draftsAtStart: Readonly<Record<string, AnnotationTokenDraft>>,
  ) => void,
) {
  const [error, setError] = useState<AnnotationPosBatchError>('');
  const savedAwaitingRefresh = useRef(false);

  const publishRefresh = useCallback(async () => {
    try {
      await reload();
      savedAwaitingRefresh.current = false;
      setError('');
    } catch {
      savedAwaitingRefresh.current = true;
      setError('stale');
    }
  }, [reload]);

  const apply = useCallback(
    async (input: {
      rows: readonly AnnotationIgtRow[];
      drafts: Readonly<Record<string, AnnotationTokenDraft>>;
      sourceTokenId: string;
      pos: string;
    }) => {
      if (savedAwaitingRefresh.current) {
        await publishRefresh();
        return;
      }
      const source = input.rows
        .flatMap((row) => row.tokens)
        .find((token) => token.id === input.sourceTokenId);
      if (source !== undefined && sourceGlossIsDirty(source, input.drafts)) {
        setError('dirty');
        return;
      }
      const writes = collectPosByFormWrites(input);
      if (writes.length === 0) {
        setError('');
        return;
      }
      const draftsAtStart = input.drafts;
      try {
        await saveAnnotationPosByForm(writes);
        clearDrafts(
          writes.map((write) => write.tokenId),
          draftsAtStart,
        );
        await publishRefresh();
      } catch {
        setError('failed');
      }
    },
    [clearDrafts, publishRefresh],
  );

  return { error, apply, retryRefresh: publishRefresh };
}
