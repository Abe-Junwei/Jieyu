import { LinguisticService } from '../../app/languageAssetPageAccess';
import { projectUtteranceAnalysisGraph } from '../../annotation/projectUtteranceAnalysisGraph';
import type { AnnotationIgtRow } from './annotationIgtRows';
import {
  displayedAnnotationTokenFields,
  type AnnotationTokenDraft,
  type AnnotationTokenWrite,
} from './annotationTokenDrafts';
import {
  verifyAnnotationTokenReadback,
  type AnnotationTokenWriteDeps,
} from './saveAnnotationIgtRowTokens';

export type PosByFormWrite = AnnotationTokenWrite & { unitId: string };

/** Same-form tokens in the rows that were passed in. Dirty drafts other than the source are skipped. */
export function collectPosByFormWrites(input: {
  rows: readonly AnnotationIgtRow[];
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  sourceTokenId: string;
  pos: string;
}): PosByFormWrite[] {
  const source = input.rows
    .flatMap((row) => row.tokens.map((token) => ({ row, token })))
    .find((item) => item.token.id === input.sourceTokenId);
  if (source === undefined) return [];
  const form = source.token.form.trim();
  const pos = input.pos.trim();
  if (form.length === 0) return [];
  const writes: PosByFormWrite[] = [];
  for (const row of input.rows) {
    for (const token of row.tokens) {
      if (token.form.trim() !== form) continue;
      const draft = input.drafts[token.id];
      const glossDirty = draft !== undefined && draft.gloss.trim() !== token.gloss.trim();
      if (
        token.id !== input.sourceTokenId &&
        draft !== undefined &&
        (glossDirty || draft.pos.trim() !== token.pos.trim())
      ) {
        continue;
      }
      if (token.pos.trim() === pos) continue;
      writes.push({
        unitId: row.id,
        tokenId: token.id,
        glossLang: token.glossLang,
        pos: pos.length > 0 ? pos : null,
      });
    }
  }
  return writes;
}

export function posLabelInGraph(form: string, pos: string): string | undefined {
  const graph = projectUtteranceAnalysisGraph({
    id: 'pos-check',
    text: form,
    tokens: [{ id: 'tok-pos', form, pos }],
  });
  return graph.nodes.find((node) => node.type === 'pos')?.label;
}

export async function saveAnnotationPosByForm(
  writes: readonly PosByFormWrite[],
  deps: Pick<AnnotationTokenWriteDeps, 'updateTokenPos' | 'listTokensByUnitIds'> = {
    updateTokenPos: (tokenId, pos) => LinguisticService.units.updateTokenPos(tokenId, pos),
    listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
  },
): Promise<number> {
  if (writes.length === 0) return 0;
  for (const write of writes) {
    await deps.updateTokenPos(write.tokenId, write.pos ?? null);
  }
  const unitIds = [...new Set(writes.map((write) => write.unitId))];
  const readback = await deps.listTokensByUnitIds(unitIds);
  verifyAnnotationTokenReadback(writes, readback);
  return writes.length;
}

export function sourceGlossIsDirty(
  token: { id: string; gloss: string },
  drafts: Readonly<Record<string, AnnotationTokenDraft>>,
): boolean {
  const draft = drafts[token.id];
  return draft !== undefined && draft.gloss.trim() !== token.gloss.trim();
}

export function displayedPos(
  token: { id: string; pos: string; gloss: string },
  drafts: Readonly<Record<string, AnnotationTokenDraft>>,
): string {
  return displayedAnnotationTokenFields(
    { ...token, glossLang: 'default', form: '' },
    drafts,
  ).pos.trim();
}
