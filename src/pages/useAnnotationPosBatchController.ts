import { useCallback, useState } from 'react';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import {
  collectPosByFormWrites,
  saveAnnotationPosByForm,
  sourceGlossIsDirty,
} from './annotation/saveAnnotationPosByForm';

export type AnnotationPosBatchError = '' | 'dirty' | 'failed';

export function useAnnotationPosBatchController(
  reload: () => void,
  clearDrafts: (tokenIds: readonly string[]) => void,
) {
  const [error, setError] = useState<AnnotationPosBatchError>('');

  const apply = useCallback(
    async (input: {
      rows: readonly AnnotationIgtRow[];
      drafts: Readonly<Record<string, AnnotationTokenDraft>>;
      sourceTokenId: string;
      pos: string;
    }) => {
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
      try {
        await saveAnnotationPosByForm(writes);
        clearDrafts(writes.map((write) => write.tokenId));
        setError('');
        reload();
      } catch {
        setError('failed');
      }
    },
    [clearDrafts, reload],
  );

  return { error, apply };
}
