export interface DesktopTextDraft {
  unitId: string;
  text: string;
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

/** One in-flight save. A later caller waits for it instead of starting a second write. */
export function claimTextSave(
  flight: { current: Promise<boolean> | null },
  alreadyHeld: boolean,
  run: () => Promise<boolean>,
): Promise<boolean> {
  if (flight.current !== null) return flight.current;
  if (alreadyHeld) return Promise.resolve(true);
  let done!: (value: boolean | PromiseLike<boolean>) => void;
  let fail!: (reason: unknown) => void;
  const pending = new Promise<boolean>((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  flight.current = pending;
  void run().then(done, fail);
  void pending.finally(() => {
    if (flight.current === pending) flight.current = null;
  });
  return pending;
}

export function normalizeSave(result: boolean | TextSaveResult): TextSaveResult {
  if (result === true || result === 'saved') return 'saved';
  if (result === 'unknown') return 'unknown';
  if (result === 'refresh-failed') return 'refresh-failed';
  return 'failed';
}
