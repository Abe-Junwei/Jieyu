import { useCallback, useState } from 'react';
import {
  downloadTextFile,
  exportUtteranceToCldf,
  exportUtteranceToConllu,
  exportUtteranceToElanNote,
  exportUtteranceToFlexNote,
  exportUtteranceToLatex,
  exportUtteranceToLigt,
} from '../annotation/analysisGraphExport';
import { assignPartOfMwe } from '../annotation/partOfMwe';
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

export type AnnotationMweError = '' | 'dirty' | 'contiguous' | 'failed';
export type AnnotationAnalysisExportKind = 'cldf' | 'conllu' | 'ligt' | 'latex' | 'flex' | 'elan';

type ConfirmInput = {
  row: AnnotationIgtRow;
  tokenDrafts: Readonly<Record<string, AnnotationTokenDraft>>;
  morphDrafts: Readonly<Record<string, AnnotationMorphemeDraft>>;
  morphsByTokenId: Readonly<Record<string, readonly AnnotationIgtMorpheme[] | undefined>>;
  linksByTokenId: Readonly<Record<string, AnnotationTokenLexemeLinkView | undefined>>;
};

function hasDirtyDrafts(input: ConfirmInput): boolean {
  if (collectDirtyAnnotationTokenWrites(input.row.tokens, input.tokenDrafts).length > 0) {
    return true;
  }
  const morphs = input.row.tokens.flatMap((token) => input.morphsByTokenId[token.id] ?? []);
  return collectDirtyAnnotationMorphemeWrites(morphs, input.morphDrafts).length > 0;
}

export function useAnnotationMweController(textId: string, reload: () => void) {
  const [selectedByUnit, setSelectedByUnit] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<AnnotationMweError>('');

  const toggle = useCallback((unitId: string, tokenId: string) => {
    setError('');
    setSelectedByUnit((current) => {
      const selected = current[unitId] ?? [];
      const next = selected.includes(tokenId)
        ? selected.filter((id) => id !== tokenId)
        : [...selected, tokenId];
      return { ...current, [unitId]: next };
    });
  }, []);

  const confirm = useCallback(
    async (input: ConfirmInput) => {
      if (hasDirtyDrafts(input)) {
        setError('dirty');
        return;
      }
      const selected = selectedByUnit[input.row.id] ?? [];
      try {
        const base = buildAnnotationUtteranceGraph(input);
        const withMwe = assignPartOfMwe(base, selected);
        await saveAnnotationUnitAnalysisGraph({
          textId,
          unitId: input.row.id,
          graph: withMwe,
        });
        setSelectedByUnit((current) => ({ ...current, [input.row.id]: [] }));
        setError('');
        reload();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '';
        setError(message.includes('contiguous') ? 'contiguous' : 'failed');
      }
    },
    [reload, selectedByUnit, textId],
  );

  const exportAnalysis = useCallback((input: ConfirmInput, kind: AnnotationAnalysisExportKind) => {
    if (hasDirtyDrafts(input)) {
      setError('dirty');
      return;
    }
    const graph = buildAnnotationUtteranceGraph(input);
    if (kind === 'conllu') {
      downloadTextFile(`${input.row.id}.conllu`, exportUtteranceToConllu(graph), 'text/plain');
      return;
    }
    if (kind === 'cldf') {
      const exported = exportUtteranceToCldf(graph, { translatedText: input.row.translation });
      downloadTextFile(
        `${input.row.id}.cldf.json`,
        JSON.stringify(exported, null, 2),
        'application/json',
      );
      return;
    }
    if (kind === 'latex') {
      downloadTextFile(`${input.row.id}.tex`, exportUtteranceToLatex(graph), 'text/plain');
      return;
    }
    if (kind === 'flex') {
      downloadTextFile(`${input.row.id}.flex.txt`, exportUtteranceToFlexNote(graph), 'text/plain');
      return;
    }
    if (kind === 'elan') {
      downloadTextFile(`${input.row.id}.elan.txt`, exportUtteranceToElanNote(graph), 'text/plain');
      return;
    }
    downloadTextFile(
      `${input.row.id}.ligt.json`,
      JSON.stringify(exportUtteranceToLigt(graph), null, 2),
      'application/ld+json',
    );
  }, []);

  return { selectedByUnit, error, toggle, confirm, exportAnalysis };
}
