import { useCallback, useState } from 'react';
import { addAlternativePos, selectAlternativeAnalysis } from '../annotation/alternativeAnalysis';
import { collectDirtyAnnotationMorphemeWrites } from './annotation/annotationMorphemeDrafts';
import type {
  AnnotationMorphemeDraft,
  AnnotationIgtMorpheme,
} from './annotation/annotationMorphemeDrafts';
import { collectDirtyAnnotationTokenWrites } from './annotation/annotationTokenDrafts';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import { buildAnnotationUtteranceGraph } from './annotation/buildAnnotationUtteranceGraph';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenLexemeLinkView } from './annotation/saveAnnotationLexemeLink';
import { saveAnnotationUnitAnalysisGraph } from './annotation/saveAnnotationUnitAnalysisGraph';

export type AnnotationAlternativeAnalysisError = '' | 'dirty' | 'failed';

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

export function useAnnotationAlternativeAnalysisController(textId: string, reload: () => void) {
  const [error, setError] = useState<AnnotationAlternativeAnalysisError>('');

  const select = useCallback(
    async (input: SelectInput) => {
      if (hasDirtyDrafts(input)) {
        setError('dirty');
        return;
      }
      try {
        const base = buildAnnotationUtteranceGraph(input);
        const next = selectAlternativeAnalysis(base, input.relationId);
        await saveAnnotationUnitAnalysisGraph({ textId, unitId: input.row.id, graph: next });
        setError('');
        reload();
      } catch {
        setError('failed');
      }
    },
    [reload, textId],
  );

  const addPos = useCallback(
    async (input: Omit<SelectInput, 'relationId'> & { tokenId: string; pos: string }) => {
      if (hasDirtyDrafts({ ...input, relationId: 'unused' })) {
        setError('dirty');
        return;
      }
      try {
        const next = addAlternativePos(
          buildAnnotationUtteranceGraph(input),
          input.tokenId,
          input.pos,
        );
        await saveAnnotationUnitAnalysisGraph({ textId, unitId: input.row.id, graph: next });
        setError('');
        reload();
      } catch {
        setError('failed');
      }
    },
    [reload, textId],
  );

  return { error, select, addPos };
}
