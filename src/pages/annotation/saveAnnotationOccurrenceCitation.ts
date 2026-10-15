import { getDb, isLexemeEntry } from '../../app/jieyuDbPageAccess';
import { dispatchWorkspaceLexemeUpdated } from '../../utils/workspaceEvents';
import { upsertOccurrenceCitation, type OccurrenceCitation } from './annotationOccurrenceCitation';

function sameCitations(
  current: readonly OccurrenceCitation[] | undefined,
  next: readonly OccurrenceCitation[],
): boolean {
  const left = current ?? [];
  if (left.length !== next.length) return false;
  return next.every((row, index) => {
    const prev = left[index];
    return (
      prev !== undefined &&
      prev.textId === row.textId &&
      prev.unitId === row.unitId &&
      prev.tokenId === row.tokenId &&
      prev.lexemeId === row.lexemeId &&
      prev.senseId === row.senseId
    );
  });
}

async function writeOccurrenceCitations(
  textId: string,
  lexemeId: string,
  nextCitations: (
    current: readonly OccurrenceCitation[] | undefined,
  ) => OccurrenceCitation[] | undefined,
): Promise<void> {
  const db = await getDb();
  let changed = false;
  await db.dexie.lexemes
    .where('id')
    .equals(lexemeId)
    .modify((row) => {
      if (!isLexemeEntry(row) || row.textId !== textId) return;
      const next = nextCitations(row.jieyu?.occurrenceCitations);
      if (next === undefined || sameCitations(row.jieyu?.occurrenceCitations, next)) return;
      const jieyu = { ...(row.jieyu ?? {}) };
      if (next.length > 0) jieyu.occurrenceCitations = next;
      else delete jieyu.occurrenceCitations;
      if (Object.keys(jieyu).length === 0) delete row.jieyu;
      else row.jieyu = jieyu;
      row.updatedAt = new Date().toISOString();
      changed = true;
    });
  if (changed) dispatchWorkspaceLexemeUpdated({ lexemeId });
}

export async function saveAnnotationOccurrenceCitation(input: {
  textId: string;
  unitId: string;
  tokenId: string;
  lexemeId: string;
  senseId: string;
}): Promise<void> {
  const citation: OccurrenceCitation = {
    textId: input.textId,
    unitId: input.unitId,
    tokenId: input.tokenId,
    lexemeId: input.lexemeId,
    senseId: input.senseId,
  };
  await writeOccurrenceCitations(input.textId, input.lexemeId, (current) =>
    upsertOccurrenceCitation(current, citation),
  );
}

export async function removeAnnotationOccurrenceCitation(input: {
  textId: string;
  lexemeId: string;
  tokenId: string;
}): Promise<void> {
  await writeOccurrenceCitations(input.textId, input.lexemeId, (current) => {
    const list = current ?? [];
    if (!list.some((row) => row.tokenId === input.tokenId)) return undefined;
    return list.filter((row) => row.tokenId !== input.tokenId);
  });
}
