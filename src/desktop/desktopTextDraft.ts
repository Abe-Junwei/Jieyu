export interface DesktopTextDraft {
  unitId: string;
  text: string;
}

export function isSameTextDraft(
  left: DesktopTextDraft | null,
  right: DesktopTextDraft | null,
): boolean {
  return (
    left !== null && right !== null && left.unitId === right.unitId && left.text === right.text
  );
}

export interface StoredTextDraft {
  unitId: string;
  rawInput: string;
  baseBody: string;
}

export type TextSaveResult = 'saved' | 'failed' | 'refresh-failed' | 'unknown';

export interface DraftStore {
  persist: (draft: StoredTextDraft) => Promise<unknown>;
  discard: (unitId: string) => Promise<unknown>;
  inspect?: (
    draft: DesktopTextDraft,
    operationId: string,
  ) => Promise<'committed' | 'not-submitted' | 'conflict'>;
}

export function normalizeSave(result: boolean | TextSaveResult): TextSaveResult {
  if (result === true || result === 'saved') return 'saved';
  if (result === 'unknown') return 'unknown';
  if (result === 'refresh-failed') return 'refresh-failed';
  return 'failed';
}
