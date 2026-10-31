import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

export interface DesktopTextDraft {
  unitId: string;
  text: string;
}

interface Pending {
  go: () => void;
  cancel: () => void;
}

/**
 * One unsaved text draft. Leaving (route change, another unit/manuscript/project) saves it first when it can be
 * submitted; a failed save, an unfinished IME composition, or empty text stops the leave until retry or discard.
 * The draft stays out of the query cache so a refetch cannot overwrite what the user typed.
 */
export function useDesktopDraftGuard(save: (draft: DesktopTextDraft) => Promise<boolean>) {
  const [draft, setDraft] = useState<DesktopTextDraft | null>(null);
  const [prompt, setPrompt] = useState<{ failed: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const composing = useRef(false);
  const pending = useRef<Pending | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const submittable = (current: DesktopTextDraft) => !composing.current && current.text.length > 0;

  const trySave = async (current: DesktopTextDraft): Promise<boolean> => {
    setSaving(true);
    const saved = await save(current).finally(() => setSaving(false));
    if (saved && draftRef.current === current) setDraft(null);
    return saved;
  };

  const leave = (go: () => void, cancel: () => void = () => {}) => {
    const current = draftRef.current;
    if (current === null) {
      go();
      return;
    }
    pending.current = { go, cancel };
    if (!submittable(current)) {
      setPrompt({ failed: false });
      return;
    }
    void trySave(current).then((saved) => {
      if (saved) {
        pending.current = null;
        go();
        return;
      }
      setPrompt({ failed: true });
    });
  };

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      draftRef.current !== null &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  const blocked = blocker.state === 'blocked';
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  useEffect(() => {
    if (!blocked) return;
    leave(
      () => blockerRef.current.proceed?.(),
      () => blockerRef.current.reset?.(),
    );
    // `leave` reads refs only; re-running on its identity would re-block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // Electron turns a cancelled beforeunload into `will-prevent-unload`; the main process asks before closing.
  const dirty = draft !== null;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const finish = (go: boolean) => {
    const next = pending.current;
    pending.current = null;
    setPrompt(null);
    if (next === null) return;
    if (go) next.go();
    else next.cancel();
  };

  return {
    draft,
    saving,
    prompt,
    canRetry: draft !== null && draft.text.length > 0,
    edit: (unitId: string, text: string, savedText: string) => {
      setDraft(text === savedText ? null : { unitId, text });
    },
    setComposing: (value: boolean) => {
      composing.current = value;
    },
    /** Save button: keeps the draft on failure. */
    commit: () => {
      const current = draftRef.current;
      if (current === null || !submittable(current)) return Promise.resolve(false);
      return trySave(current);
    },
    leave,
    retry: () => {
      const current = draftRef.current;
      if (current === null || current.text.length === 0) return;
      composing.current = false;
      void trySave(current).then((saved) => {
        if (saved) finish(true);
        else setPrompt({ failed: true });
      });
    },
    discard: () => {
      setDraft(null);
      draftRef.current = null;
      finish(true);
    },
    stay: () => finish(false),
  };
}
