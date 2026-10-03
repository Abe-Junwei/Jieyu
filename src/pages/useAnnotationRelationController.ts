import { useCallback, useState } from 'react';
import type { AnnotationAnalysisGraphFixture } from '../annotation/analysisGraph';
import {
  assignAllomorph,
  assignDiscontinuousParts,
  assignIncorporation,
  assignReduplicates,
  assignTone,
  assignRootPattern,
  assignSegmentProcess,
  assignSharedFeature,
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
  | { kind: 'substitutesSegment' | 'deletesSegment'; tokenId: string }
  | { kind: 'overwritesTone'; tokenId: string; tone: string }
  | { kind: 'discontinuous'; tokenId: string; leftMorphId: string; rightMorphId: string }
  | { kind: 'sharedFeature'; laterMorphId: string; earlierMorphId: string }
  | { kind: 'rootPattern'; tokenId: string; root: string; pattern: string }
  | { kind: 'incorporation'; morphId: string }
  | { kind: 'allomorph'; morphId: string };

function applyMark(
  graph: AnnotationAnalysisGraphFixture,
  mark: AnnotationRelationMark,
): AnnotationAnalysisGraphFixture {
  if (mark.kind === 'reduplicates') {
    return assignReduplicates(graph, mark.reduplicantId, mark.stemId);
  }
  if (mark.kind === 'suppletes') return assignSuppletion(graph, mark.tokenId, mark.underlying);
  if (mark.kind === 'sharedFeature') {
    return assignSharedFeature(graph, mark.laterMorphId, mark.earlierMorphId);
  }
  if (mark.kind === 'rootPattern') {
    return assignRootPattern(graph, mark.tokenId, mark.root, mark.pattern);
  }
  if (mark.kind === 'incorporation') return assignIncorporation(graph, mark.morphId);
  if (mark.kind === 'allomorph') return assignAllomorph(graph, mark.morphId);
  if (mark.kind === 'overwritesTone') return assignTone(graph, mark.tokenId, mark.tone);
  if (mark.kind === 'discontinuous') {
    return assignDiscontinuousParts(graph, mark.tokenId, mark.leftMorphId, mark.rightMorphId);
  }
  return assignSegmentProcess(graph, mark.tokenId, mark.kind);
}

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
        if (base === undefined) {
          setError('failed');
          return;
        }
        const next = applyMark(base, input.mark);
        await saveAnnotationUnitAnalysisGraph({
          textId,
          unitId: input.row.id,
          graph: next,
          expectedBase: input.row.analysisGraph,
        });
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
