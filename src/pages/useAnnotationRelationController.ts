import { useCallback, useState } from 'react';
import {
  assignReduplicates,
  assignSegmentProcess,
  assignSuppletion,
} from '../annotation/morphologyRelations';
import type {
  AnnotationMorphemeDraft,
  AnnotationIgtMorpheme,
} from './annotation/annotationMorphemeDrafts';
import { collectDirtyAnnotationMorphemeWrites } from './annotation/annotationMorphemeDrafts';
import { collectDirtyAnnotationTokenWrites } from './annotation/annotationTokenDrafts';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import { buildAnnotationUtteranceGraph } from './annotation/buildAnnotationUtteranceGraph';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenLexemeLinkView } from './annotation/saveAnnotationLexemeLink';
import { saveAnnotationUnitAnalysisGraph } from './annotation/saveAnnotationUnitAnalysisGraph';

export type AnnotationRelationError = '' | 'dirty' | 'failed';

export type AnnotationRelationMark =
  | { kind: 'reduplicates'; tokenId: string; reduplicantId: string; stemId: string }
  | { kind: 'suppletes'; tokenId: string; underlying: string }
  | { kind: 'substitutesSegment' | 'deletesSegment' | 'overwritesTone'; tokenId: string };

type ApplyInput = {
  row: AnnotationIgtRow;
  tokenDrafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphDrafts: Readonly<Record<string, AnnotationMorphemeDraft>>;
  morphsByTokenId: Readonly<Record<string, readonly AnnotationIgtMorpheme[] | undefined>>;
  linksByTokenId: Readonly<Record<string, AnnotationTokenLexemeLinkView | undefined>>;
  mark: AnnotationRelationMark;
};

function hasDirtyDrafts(input: ApplyInput): boolean {
  if (collectDirtyAnnotationTokenWrites(input.row.tokens, input.tokenDrafts).length > 0)
    return true;
  const morphs = input.row.tokens.flatMap((token) => input.morphsByTokenId[token.id] ?? []);
  return collectDirtyAnnotationMorphemeWrites(morphs, input.morphDrafts).length > 0;
}

export function useAnnotationRelationController(textId: string, reload: () => void) {
  const [error, setError] = useState<AnnotationRelationError>('');

  const apply = useCallback(
    async (input: ApplyInput) => {
      if (hasDirtyDrafts(input)) {
        setError('dirty');
        return;
      }
      try {
        const base = buildAnnotationUtteranceGraph(input);
        const mark = input.mark;
        const next =
          mark.kind === 'reduplicates'
            ? assignReduplicates(base, mark.reduplicantId, mark.stemId)
            : mark.kind === 'suppletes'
              ? assignSuppletion(base, mark.tokenId, mark.underlying)
              : assignSegmentProcess(base, mark.tokenId, mark.kind);
        await saveAnnotationUnitAnalysisGraph({ textId, unitId: input.row.id, graph: next });
        setError('');
        reload();
      } catch {
        setError('failed');
      }
    },
    [reload, textId],
  );

  return { error, apply };
}
