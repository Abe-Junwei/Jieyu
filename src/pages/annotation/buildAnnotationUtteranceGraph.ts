import { retainAlternativeAnalyses } from '../../annotation/alternativeAnalysis';
import { retainMorphologyRelations } from '../../annotation/morphologyRelations';
import { retainPartOfMwe } from '../../annotation/partOfMwe';
import { projectUtteranceAnalysisGraph } from '../../annotation/projectUtteranceAnalysisGraph';
import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import type { AnnotationIgtMorpheme } from './annotationMorphemeDrafts';
import type { AnnotationIgtRow } from './annotationIgtRows';
import type { AnnotationTokenLexemeLinkView } from './saveAnnotationLexemeLink';

export function buildAnnotationUtteranceGraph(input: {
  row: AnnotationIgtRow;
  morphsByTokenId: Readonly<Record<string, readonly AnnotationIgtMorpheme[] | undefined>>;
  linksByTokenId: Readonly<Record<string, AnnotationTokenLexemeLinkView | undefined>>;
}): AnnotationAnalysisGraphFixture | undefined {
  const tokens = input.row.tokens.flatMap((token) => {
    if (token.form.trim().length === 0) return [];
    const link = input.linksByTokenId[token.id];
    return [
      {
        id: token.id,
        form: token.form,
        ...(token.gloss.length > 0 ? { gloss: token.gloss } : {}),
        ...(token.pos.length > 0 ? { pos: token.pos } : {}),
        ...(link?.senseId ? { senseId: link.senseId } : {}),
        ...(link?.entryPartsOfSpeech ? { entryPartsOfSpeech: link.entryPartsOfSpeech } : {}),
        morphemes: (input.morphsByTokenId[token.id] ?? []).map((morph) => ({
          id: morph.id,
          form: morph.form,
          ...(morph.gloss.length > 0 ? { gloss: morph.gloss } : {}),
          ...(morph.surfaceParts && morph.surfaceParts.length > 0
            ? { surfaceParts: morph.surfaceParts }
            : {}),
        })),
      },
    ];
  });
  const text =
    input.row.surface.trim().length > 0
      ? input.row.surface.trim()
      : tokens
          .map((token) => token.form)
          .join(' ')
          .trim();
  if (text.length === 0) return undefined;
  const fresh = projectUtteranceAnalysisGraph({
    id: input.row.id,
    text,
    tokens,
  });
  return retainAlternativeAnalyses(
    retainMorphologyRelations(
      retainPartOfMwe(fresh, input.row.analysisGraph),
      input.row.analysisGraph,
    ),
    input.row.analysisGraph,
  );
}
