import { useRef, useState } from 'react';
import type { DesktopTextDraft, StoredTextDraft } from './desktopTextDraft';
export interface DraftResolution {
  baseBody: string;
  currentBody: string;
  rawInput: string;
}

/** A changed baseline stays blocked until the user resolves or discards the stored draft. */
export function useDesktopDraftConflict() {
  const [value, setValue] = useState<(DraftResolution & { unitId: string }) | null>(null);
  const current = useRef(value);
  const show = (next: typeof value) => {
    current.current = next;
    setValue(next);
  };
  return {
    value,
    current,
    async resolve(
      draft: { current: DesktopTextDraft | null },
      write: (next: DesktopTextDraft) => void,
      save: (next: DesktopTextDraft) => Promise<boolean>,
    ) {
      const snapshot = current.current;
      const next = draft.current;
      if (!snapshot || !next || next.text !== snapshot.rawInput) return false;
      show(null);
      const resolved = { ...next, resolveDraft: snapshot };
      write(resolved);
      const saved = await save(resolved);
      if (!saved) show(snapshot);
      return saved;
    },
    restore(row: StoredTextDraft, savedText: string) {
      if (row.baseBody !== savedText)
        show({
          unitId: row.unitId,
          baseBody: row.baseBody,
          currentBody: savedText,
          rawInput: row.rawInput,
        });
    },
    clear: () => show(null),
    show,
  };
}
