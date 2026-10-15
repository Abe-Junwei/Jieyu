import { useCallback, useRef, useState } from 'react';
import { addAlternativePos, selectAlternativeAnalysis } from '../annotation/alternativeAnalysis';
import { collectDirtyAnnotationMorphemeWrites } from './annotation/annotationMorphemeDrafts';
import type {
  AnnotationMorphemeDraft,
  AnnotationIgtMorpheme,
} from './annotation/annotationMorphemeDrafts';
import { collectDirtyAnnotationTokenWrites } from './annotation/annotationTokenDrafts';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenLexemeLinkView } from './annotation/saveAnnotationLexemeLink';
import { saveAnnotationUtteranceGraphChange } from './annotation/saveAnnotationUnitAnalysisGraph';

export type AnnotationAlternativeAnalysisError = '' | 'dirty' | 'failed' | 'stale';

type SelectInput = {
  row: AnnotationIgtRow;
  tokenDrafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphDrafts: Readonly<Record<string, AnnotationMorphemeDraft>>;
  morphsByTokenId: Readonly<Record<string, readonly AnnotationIgtMorpheme[] | undefined>>;
  linksByTokenId: Readonly<Record<string, AnnotationTokenLexemeLinkView | undefined>>;
  relationId: string;
};

function hasDirtyDrafts(input: SelectInput): boolean {
  if (collectDirtyAnnotationTokenWrites(input.row.tokens, input.tokenDrafts).length > 0) {
    return true;
  }
  const morphs = input.row.tokens.flatMap((token) => input.morphsByTokenId[token.id] ?? []);
  return collectDirtyAnnotationMorphemeWrites(morphs, input.morphDrafts).length > 0;
}

export function useAnnotationAlternativeAnalysisController(
  textId: string,
  reload: () => Promise<unknown>,
) {
  const [error, setError] = useState<AnnotationAlternativeAnalysisError>('');
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

  const select = useCallback(
    async (input: SelectInput) => {
      if (savedAwaitingRefresh.current) {
        await publishRefresh();
        return;
      }
      if (hasDirtyDrafts(input)) {
        setError('dirty');
        return;
      }
      try {
        const saved = await saveAnnotationUtteranceGraphChange({
          textId,
          row: input.row,
          morphsByTokenId: input.morphsByTokenId,
          linksByTokenId: input.linksByTokenId,
          change: (graph) => selectAlternativeAnalysis(graph, input.relationId),
        });
        if (saved === null) {
          setError('failed');
          return;
        }
        await publishRefresh();
      } catch {
        setError('failed');
      }
    },
    [publishRefresh, textId],
  );

  const addPos = useCallback(
    async (input: Omit<SelectInput, 'relationId'> & { tokenId: string; pos: string }) => {
      const tokenWrites = collectDirtyAnnotationTokenWrites(input.row.tokens, input.tokenDrafts);
      const sourcePos = input.pos.trim();
      const blocked = tokenWrites.some((write) => {
        if (write.tokenId !== input.tokenId) return true;
        if (write.gloss !== undefined) return true;
        return (write.pos ?? '') !== sourcePos;
      });
      if (savedAwaitingRefresh.current) {
        await publishRefresh();
        return;
      }
      const morphs = input.row.tokens.flatMap((token) => input.morphsByTokenId[token.id] ?? []);
      if (blocked || collectDirtyAnnotationMorphemeWrites(morphs, input.morphDrafts).length > 0) {
        setError('dirty');
        return;
      }
      try {
        const saved = await saveAnnotationUtteranceGraphChange({
          textId,
          row: input.row,
          morphsByTokenId: input.morphsByTokenId,
          linksByTokenId: input.linksByTokenId,
          change: (graph) => addAlternativePos(graph, input.tokenId, input.pos),
        });
        if (saved === null) {
          setError('failed');
          return;
        }
        await publishRefresh();
      } catch {
        setError('failed');
      }
    },
    [publishRefresh, textId],
  );

  return { error, select, addPos, retryRefresh: publishRefresh };
}
