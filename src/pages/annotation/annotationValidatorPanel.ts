import type { AnnotationIgtRow } from '../useAnnotationWorkspaceController';
import { annotationGlossHasLeipzigIssue } from './annotationLeipzigGloss';
import { previewAnnotationStructuralCandidate } from './annotationStructuralPreviewController';
import { displayedAnnotationTokenFields, type AnnotationTokenDraft } from './annotationTokenDrafts';

export type AnnotationValidatorGlossInput = {
  tokenId: string;
  form: string;
  gloss: string;
};

export type AnnotationValidatorPanelItem = {
  tokenId: string;
  form: string;
  gloss: string;
  segments: string[];
  leipzigInvalid: boolean;
  needsReview: boolean;
  warnings: string[];
};

export function collectAnnotationValidatorGlosses(
  row: AnnotationIgtRow | undefined,
  drafts: Readonly<Record<string, AnnotationTokenDraft>>,
): AnnotationValidatorGlossInput[] {
  if (!row) return [];
  const glosses: AnnotationValidatorGlossInput[] = [];
  for (const token of row.tokens) {
    const gloss = displayedAnnotationTokenFields(token, drafts).gloss.trim();
    if (gloss.length === 0) continue;
    glosses.push({ tokenId: token.id, form: token.form, gloss });
  }
  return glosses;
}

export async function loadAnnotationValidatorPanel(
  glosses: readonly AnnotationValidatorGlossInput[],
): Promise<AnnotationValidatorPanelItem[]> {
  return Promise.all(
    glosses.map(async (item) => {
      const form = item.form.trim();
      const preview = await previewAnnotationStructuralCandidate({
        glossText: item.gloss,
        ...(form.length > 0 ? { text: form } : {}),
      });
      const warnings = preview.warnings
        .filter((warning) => warning.severity === 'warning')
        .map((warning) => warning.message);
      const leipzigInvalid = annotationGlossHasLeipzigIssue(item.gloss);
      return {
        tokenId: item.tokenId,
        form: item.form,
        gloss: item.gloss,
        segments: preview.segments.map((segment) => segment.text),
        leipzigInvalid,
        needsReview: leipzigInvalid || !preview.canConfirmWithoutReview,
        warnings,
      };
    }),
  );
}
