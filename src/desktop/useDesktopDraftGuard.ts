import { useEffect, useRef, useState } from 'react';
import { useDesktopDraftLeaveGuard } from '../hooks/desktop/useDesktopDraftLeaveGuard';
import {
  isSameTextDraft,
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
 * refresh failed stays on that unit and is not written again until that text changes. A stale query
 * baseline is not the committed text. The draft stays out of the query cache.
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
  const sent = useRef<{ id: string; text: string; unitId: string } | null>(null);
  const unresolved = useRef<{ draft: DesktopTextDraft; id: string } | null>(null);
  const used = useRef<{ id: string; text: string } | null>(null);
  const heldDraft = useRef<DesktopTextDraft | null>(null);
  const flying = useRef(false);
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

  const markHeld = (next: DesktopTextDraft | null) => {
    heldDraft.current = next;
  };
  const held = (current: DesktopTextDraft | null) => isSameTextDraft(heldDraft.current, current);

  const submittable = (current: DesktopTextDraft) => !composing.current && current.text.length > 0;

  const persist = (current: DesktopTextDraft) => {
    const inflight = sent.current;
    const base =
      inflight !== null && inflight.unitId === current.unitId && inflight.text !== current.text
        ? inflight.text
        : baseText.current;
    void storeRef.current?.persist({
      unitId: current.unitId,
      rawInput: current.text,
      baseBody: base,
    });
  };

  const trySave = async (current: DesktopTextDraft): Promise<boolean> => {
    if (flying.current || held(current)) return held(current);
    if (unresolved.current !== null) {
      const previous = unresolved.current;
      flying.current = true;
      setSaving(true);
      try {
        const result = await storeRef.current?.inspect?.(previous.draft, previous.id);
        if (result !== 'committed' && result !== 'not-submitted') return false;
        unresolved.current = null;
        current = draftRef.current ?? current;
        if (result === 'committed' && isSameTextDraft(current, previous.draft)) {
          operationId.current = null;
          markHeld(current);
          return true;
        }
        if (result === 'committed') markHeld(previous.draft);
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
    sent.current = { id, text: current.text, unitId: current.unitId };
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
    const latest = draftRef.current;
    if (!isSameTextDraft(latest, current)) {
      if (outcome === 'refresh-failed') markHeld(current);
      sent.current = null;
      if (outcome === 'failed') return false;
      if (latest === null || held(latest)) return true;
      if (!submittable(latest)) return false;
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
      markHeld(current);
      return true;
    }
    if (heldDraft.current?.unitId === current.unitId) markHeld(null);
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
      const committed = heldDraft.current?.unitId === unitId ? heldDraft.current.text : null;
      const queryStale = committed !== null && committed !== savedText;
      baseText.current = queryStale && committed !== null ? committed : savedText;
      const inflight = sent.current;
      const unitChanged = draftRef.current !== null && draftRef.current.unitId !== unitId;
      const awaitingDifferent =
        inflight !== null && (inflight.unitId !== unitId || inflight.text !== text);
      if (text === savedText && !queryStale && !awaitingDifferent && unresolved.current === null) {
        operationId.current = null;
        sent.current = null;
        used.current = null;
        if (heldDraft.current?.unitId === unitId) markHeld(null);
        clearTimers();
        show(null);
        void storeRef.current?.discard(unitId);
        return;
      }
      const heldMoved = heldDraft.current?.unitId === unitId && heldDraft.current.text !== text;
      if (
        operationId.current === null ||
        awaitingDifferent ||
        unitChanged ||
        (used.current !== null && used.current.text !== text) ||
        heldMoved
      ) {
        operationId.current = crypto.randomUUID();
        if (used.current !== null && (used.current.text !== text || unitChanged)) {
          used.current = null;
        }
        if (heldMoved) markHeld(null);
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
      if (heldDraft.current?.unitId === row.unitId && heldDraft.current.text !== row.rawInput) {
        markHeld(null);
      }
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
      if (heldDraft.current?.unitId === unitId) markHeld(null);
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
      if (current === null || heldDraft.current?.unitId === current.unitId) markHeld(null);
      clearTimers();
      show(null);
      leaving.finish(true);
      return true;
    },
    stay: () => leaving.finish(false),
  };
}
