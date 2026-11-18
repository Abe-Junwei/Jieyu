import { useEffect, useRef, useState } from 'react';
import { useDesktopDraftLeaveGuard } from '../hooks/desktop/useDesktopDraftLeaveGuard';
import {
  claimTextSave,
  normalizeSave,
  type DesktopTextDraft,
  type DraftStore,
  type StoredTextDraft,
  type TextSaveResult,
} from './desktopTextDraft';

const IDLE_MS = 500;
const CAP_MS = 5000;

/**
 * One unsaved text draft. Leaving saves it first when it can be submitted. A failed save, an unfinished
 * IME composition, or empty text stops the leave until retry or discard. A committed save whose list
 * refresh failed stays on screen and is not written again. The draft stays out of the query cache.
 */
export function useDesktopDraftGuard(
  save: (draft: DesktopTextDraft, operationId: string) => Promise<boolean | TextSaveResult>,
  store?: DraftStore,
) {
  const [draft, setDraft] = useState<DesktopTextDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const composing = useRef(false);
  const draftRef = useRef(draft);
  const baseText = useRef('');
  const operationId = useRef<string | null>(null);
  const sent = useRef<{ id: string; text: string } | null>(null);
  const unresolved = useRef<{ draft: DesktopTextDraft; id: string } | null>(null);
  const used = useRef<{ id: string; text: string } | null>(null);
  const heldText = useRef<string | null>(null);
  const flying = useRef(false);
  const flight = useRef<Promise<boolean> | null>(null);
  const dirtySince = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const capTimer = useRef<number | null>(null);
  const saveRef = useRef(save);
  const storeRef = useRef(store);
  draftRef.current = draft;
  saveRef.current = save;
  storeRef.current = store;

  const show = (next: DesktopTextDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const clearTimers = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    if (capTimer.current !== null) window.clearTimeout(capTimer.current);
    idleTimer.current = null;
    capTimer.current = null;
    dirtySince.current = null;
  };

  const markHeld = (text: string | null) => {
    heldText.current = text;
  };
  const held = (current: DesktopTextDraft | null) =>
    current !== null && heldText.current === current.text;

  const submittable = (current: DesktopTextDraft) => !composing.current && current.text.length > 0;

  const persist = (current: DesktopTextDraft) => {
    const inflight = sent.current;
    const base =
      inflight !== null && inflight.text !== current.text ? inflight.text : baseText.current;
    void storeRef.current?.persist({
      unitId: current.unitId,
      rawInput: current.text,
      baseBody: base,
    });
  };

  const trySave = (current: DesktopTextDraft): Promise<boolean> =>
    claimTextSave(flight, held(current), () => attempt(current));

  const attempt = async (current: DesktopTextDraft): Promise<boolean> => {
    if (unresolved.current !== null) {
      const previous = unresolved.current;
      flying.current = true;
      setSaving(true);
      try {
        const result = await storeRef.current?.inspect?.(previous.draft, previous.id);
        if (result !== 'committed' && result !== 'not-submitted') return false;
        unresolved.current = null;
        current = draftRef.current ?? current;
        if (result === 'committed' && current.text === previous.draft.text) {
          operationId.current = null;
          markHeld(current.text);
          return true;
        }
      } catch {
        return false;
      } finally {
        flying.current = false;
        setSaving(false);
      }
    }
    if (!submittable(current)) return false;
    const id = operationId.current ?? crypto.randomUUID();
    operationId.current = id;
    sent.current = { id, text: current.text };
    used.current = sent.current;
    flying.current = true;
    setSaving(true);
    const outcome = await saveRef
      .current(current, id)
      .then(normalizeSave)
      .finally(() => {
        flying.current = false;
        setSaving(false);
      });
    if (outcome === 'unknown') {
      unresolved.current = { draft: current, id };
      return false;
    }
    if (draftRef.current?.text !== current.text) {
      sent.current = null;
      if (outcome === 'failed') return false;
      const latest = draftRef.current;
      if (latest === null || held(latest)) return true;
      if (!submittable(latest)) return false;
      // Callers still await this attempt. Free the slot so the newer text is its own flight.
      flight.current = null;
      return trySave(latest);
    }
    if (outcome === 'failed') {
      sent.current = null;
      return false;
    }
    operationId.current = null;
    sent.current = null;
    used.current = null;
    clearTimers();
    if (outcome === 'refresh-failed') {
      markHeld(current.text);
      return true;
    }
    markHeld(null);
    show(null);
    return true;
  };

  const flush = () => {
    const current = draftRef.current;
    if (current === null || flying.current || held(current)) return;
    persist(current);
    if (!submittable(current)) return;
    void trySave(current);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const arm = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    const current = draftRef.current;
    if (current === null || held(current)) return;
    if (dirtySince.current === null) {
      dirtySince.current = Date.now();
      capTimer.current = window.setTimeout(() => flushRef.current(), CAP_MS);
    }
    idleTimer.current = window.setTimeout(() => flushRef.current(), IDLE_MS);
  };

  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      if (capTimer.current !== null) window.clearTimeout(capTimer.current);
    },
    [],
  );

  const leaving = useDesktopDraftLeaveGuard(
    draftRef,
    held,
    (current) => unresolved.current !== null || submittable(current),
    trySave,
  );

  return {
    draft,
    saving,
    prompt: leaving.prompt,
    unknown: unresolved.current !== null,
    canRetry:
      unresolved.current !== null || (draft !== null && draft.text.length > 0 && !held(draft)),
    edit: (unitId: string, text: string, savedText: string) => {
      baseText.current = savedText;
      const inflight = sent.current;
      const awaitingDifferent = inflight !== null && inflight.text !== text;
      if (text === savedText && !awaitingDifferent && unresolved.current === null) {
        operationId.current = null;
        sent.current = null;
        used.current = null;
        markHeld(null);
        clearTimers();
        show(null);
        void storeRef.current?.discard(unitId);
        return;
      }
      if (
        operationId.current === null ||
        awaitingDifferent ||
        (used.current !== null && used.current.text !== text) ||
        (heldText.current !== null && heldText.current !== text)
      ) {
        operationId.current = crypto.randomUUID();
        if (used.current !== null && used.current.text !== text) used.current = null;
        if (heldText.current !== null && heldText.current !== text) markHeld(null);
      }
      const next = { unitId, text };
      show(next);
      persist(next);
      arm();
    },
    restore: (row: StoredTextDraft, savedText: string) => {
      if (draftRef.current !== null || row.rawInput === savedText) return;
      baseText.current = row.baseBody;
      operationId.current = crypto.randomUUID();
      markHeld(null);
      show({ unitId: row.unitId, text: row.rawInput });
      arm();
    },
    syncSaved: (unitId: string, savedText: string) => {
      const current = draftRef.current;
      if (
        unresolved.current !== null ||
        current === null ||
        current.unitId !== unitId ||
        current.text !== savedText
      )
        return;
      operationId.current = null;
      sent.current = null;
      used.current = null;
      markHeld(null);
      clearTimers();
      show(null);
    },
    setComposing: (value: boolean) => {
      composing.current = value;
      if (!value) flushRef.current();
    },
    flushForClose: async (): Promise<'saved' | 'failed' | 'blocked' | 'unknown'> => {
      const current = draftRef.current;
      if (current === null || held(current)) return 'saved';
      if (unresolved.current === null && !submittable(current)) return 'blocked';
      const ok = await trySave(current);
      if (unresolved.current !== null) return 'unknown';
      const latest = draftRef.current;
      if (latest !== null && !held(latest) && !submittable(latest)) return 'blocked';
      if (!ok || (latest !== null && !held(latest))) return 'failed';
      return 'saved';
    },
    commit: () => {
      const current = draftRef.current;
      if (
        current === null ||
        (unresolved.current === null && !submittable(current)) ||
        held(current)
      )
        return Promise.resolve(false);
      return trySave(current);
    },
    leave: leaving.leave,
    retry: leaving.retry,
    discard: async () => {
      if (flying.current || unresolved.current !== null) return false;
      const current = draftRef.current;
      try {
        if (current !== null) await storeRef.current?.discard(current.unitId);
      } catch {
        leaving.fail();
        return false;
      }
      operationId.current = null;
      sent.current = null;
      used.current = null;
      markHeld(null);
      clearTimers();
      show(null);
      leaving.finish(true);
      return true;
    },
    stay: () => leaving.finish(false),
  };
}
