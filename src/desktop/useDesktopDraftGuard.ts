import { useDesktopDraftConflict } from './useDesktopDraftConflict';
import { useRef, useState } from 'react';
import { useDesktopDraftLeaveGuard } from '../hooks/desktop/useDesktopDraftLeaveGuard';
import {
  persistStructuralDraft,
  claimTextSave,
  isSameTextDraft,
  normalizeSave,
  type DesktopTextDraft,
  type DraftStore,
  type StoredTextDraft,
  type TextSaveResult,
} from './desktopTextDraft';

import { useDesktopDraftTimers } from './useDesktopDraftTimers';

/**
 * One unsaved text draft. Leaving saves it first when it can be submitted. A failed save, an unfinished
 * IME composition stops the leave until retry or discard. A committed save whose list
 * refresh failed stays on that unit and is not written again until that text changes. A stale query
 * baseline is not the committed text. The draft stays out of the query cache.
 */
export function useDesktopDraftGuard(
  save: (draft: DesktopTextDraft, operationId: string) => Promise<boolean | TextSaveResult>,
  store?: DraftStore,
) {
  const conflict = useDesktopDraftConflict();
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
  const flight = useRef<Promise<boolean> | null>(null);
  const timers = useDesktopDraftTimers(() => flushRef.current());
  const clearTimers = timers.clear;
  const saveRef = useRef(save);
  const storeRef = useRef(store);
  draftRef.current = draft;
  saveRef.current = save;
  storeRef.current = store;

  const show = (next: DesktopTextDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const markHeld = (next: DesktopTextDraft | null) => {
    heldDraft.current = next;
  };
  const held = (current: DesktopTextDraft | null) => isSameTextDraft(heldDraft.current, current);

  const reset = (unitId: string | null) => {
    composing.current = false;
    operationId.current = null;
    sent.current = null;
    used.current = null;
    if (unitId === null || heldDraft.current?.unitId === unitId) markHeld(null);
    clearTimers();
    conflict.clear();
    show(null);
  };

  const submittable = (_current: DesktopTextDraft) =>
    !composing.current && conflict.current.current === null;

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
    const current = draftRef.current;
    timers.arm(current === null || held(current));
  };

  const leaving = useDesktopDraftLeaveGuard(
    draftRef,
    held,
    (current) => unresolved.current !== null || submittable(current),
    trySave,
  );

  return {
    draft,
    conflict: conflict.value,
    resolveConflict: () => conflict.resolve(draftRef, show, trySave),
    persistForStructure: () => {
      clearTimers();
      return persistStructuralDraft(
        draftRef.current,
        flying.current || unresolved.current !== null,
        baseText.current,
        storeRef.current,
      );
    },
    structureCommitted: () => reset(null),
    saving,
    prompt: leaving.prompt,
    unknown: unresolved.current !== null,
    canRetry: unresolved.current !== null || (draft !== null && !held(draft)),
    edit: (unitId: string, text: string, savedText: string) => {
      const committed = heldDraft.current?.unitId === unitId ? heldDraft.current.text : null;
      const queryStale = committed !== null && committed !== savedText;
      baseText.current =
        conflict.current.current?.unitId === unitId
          ? conflict.current.current.baseBody
          : queryStale && committed !== null
            ? committed
            : savedText;
      const inflight = sent.current;
      const unitChanged = draftRef.current !== null && draftRef.current.unitId !== unitId;
      const awaitingDifferent =
        inflight !== null && (inflight.unitId !== unitId || inflight.text !== text);
      if (
        text === savedText &&
        conflict.current.current === null &&
        !queryStale &&
        !awaitingDifferent &&
        unresolved.current === null
      ) {
        reset(unitId);
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
      if (conflict.current.current?.unitId === unitId)
        conflict.show({ ...conflict.current.current, rawInput: text });
      const next = { unitId, text };
      show(next);
      persist(next);
      arm();
    },
    restore: (row: StoredTextDraft, savedText: string) => {
      if (draftRef.current !== null || row.rawInput === savedText) return;
      conflict.restore(row, savedText);
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
      reset(unitId);
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
      reset(current?.unitId ?? null);
      leaving.finish(true);
      return true;
    },
    stay: () => leaving.finish(false),
  };
}
