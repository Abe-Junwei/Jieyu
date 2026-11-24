import type { DraftResolution } from '../desktop/useDesktopDraftConflict';
/**
 * The text draft guard tracks one opaque draft id. On the transcription page one unit shows a body
 * per text layer (ADR-0132), so the id carries both and the store adapters split it again.
 */
const SEP = '\u001f';

export function textKey(layerId: string, unitId: string): string {
  return `${layerId}${SEP}${unitId}`;
}

export function splitTextKey(key: string): { unitId: string; textLayerId?: string } {
  const at = key.indexOf(SEP);
  if (at < 0) return { unitId: key };
  return { textLayerId: key.slice(0, at), unitId: key.slice(at + 1) };
}

type TextSave = 'saved' | 'failed' | 'refresh-failed' | 'unknown';

/** Store adapters for `useDesktopDraftGuard` whose draft ids are `textKey`s. */
export function layerTextStore(read: {
  saveText: (
    unitId: string,
    text: string,
    operationId?: string,
    textLayerId?: string,
    resolveDraft?: DraftResolution,
  ) => Promise<TextSave>;
  persistTextDraft: (
    unitId: string,
    text: string,
    baseBody: string,
    textLayerId?: string,
  ) => Promise<unknown>;
  discardTextDraft: (unitId: string, textLayerId?: string) => Promise<unknown>;
  inspectTextSave: (
    draft: { unitId: string; textLayerId?: string; text: string },
    operationId: string,
  ) => Promise<'committed' | 'not-submitted' | 'conflict'>;
}) {
  return {
    save: (
      draft: { unitId: string; text: string; resolveDraft?: DraftResolution },
      operationId: string,
    ) => {
      const { unitId, textLayerId } = splitTextKey(draft.unitId);
      if (draft.resolveDraft !== undefined)
        return read.saveText(unitId, draft.text, operationId, textLayerId, draft.resolveDraft);
      return textLayerId === undefined
        ? read.saveText(unitId, draft.text, operationId)
        : read.saveText(unitId, draft.text, operationId, textLayerId);
    },
    store: {
      persist: (item: { unitId: string; rawInput: string; baseBody: string }) => {
        const { unitId, textLayerId } = splitTextKey(item.unitId);
        return textLayerId === undefined
          ? read.persistTextDraft(unitId, item.rawInput, item.baseBody)
          : read.persistTextDraft(unitId, item.rawInput, item.baseBody, textLayerId);
      },
      discard: (key: string) => {
        const { unitId, textLayerId } = splitTextKey(key);
        return textLayerId === undefined
          ? read.discardTextDraft(unitId)
          : read.discardTextDraft(unitId, textLayerId);
      },
      inspect: (draft: { unitId: string; text: string }, operationId: string) =>
        read.inspectTextSave({ ...splitTextKey(draft.unitId), text: draft.text }, operationId),
    },
  };
}
