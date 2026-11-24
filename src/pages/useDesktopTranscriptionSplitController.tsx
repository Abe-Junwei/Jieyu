import { DesktopTranscriptionSplitDialog } from './DesktopTranscriptionSplitDialog';
import type { SplitTextPreview, FormalCut } from '../app/desktopProjectReadPageAccess';
import { useEffect, useRef, useState } from 'react';
import { t, tf, type Locale } from '../i18n';
import { useToast } from '../contexts/ToastContext';
import { textKey } from './desktopTranscriptionTextKey';

const MIN_SPLIT_MS = 10;

interface SplitUnit {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface SplitCaret {
  layerId: string;
  unitId: string;
  index: number;
  source: string;
}

export type SplitOpen =
  | { ok: false; reason: 'outside' | 'too-close' }
  | { ok: true; textLayerId: string; source: string; cutIndex: number };

/** Time must sit inside the segment, at least 10 ms from either edge. A caret on this unit cuts that layer. */
export function splitOpen(input: {
  timeMs: number;
  startMs: number;
  endMs: number;
  unitId: string;
  activeLayerId: string;
  activeSource: string;
  caret: SplitCaret | null;
}): SplitOpen {
  if (input.timeMs < input.startMs || input.timeMs >= input.endMs)
    return { ok: false, reason: 'outside' };
  if (input.timeMs - input.startMs < MIN_SPLIT_MS || input.endMs - input.timeMs < MIN_SPLIT_MS) {
    return { ok: false, reason: 'too-close' };
  }
  const caret = input.caret?.unitId === input.unitId ? input.caret : null;
  const textLayerId = caret?.layerId ?? input.activeLayerId;
  const source =
    caret === null || caret.layerId === input.activeLayerId ? input.activeSource : caret.source;
  const cutIndex =
    caret === null ? source.length : Math.min(Math.max(caret.index, 0), source.length);
  return { ok: true, textLayerId, source, cutIndex };
}

function annotationField(
  target: EventTarget | null,
): HTMLInputElement | HTMLTextAreaElement | null {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return null;
  if (!target.classList.contains('timeline-annotation-input')) return null;
  return target;
}

function caretFrom(target: EventTarget | null): SplitCaret | null {
  const field = annotationField(target);
  if (!field) return null;
  const unitId = field.closest('[data-unit-id]')?.getAttribute('data-unit-id');
  const layerId = field.closest('[data-layer-id]')?.getAttribute('data-layer-id');
  if (!unitId || !layerId) return null;
  return {
    layerId,
    unitId,
    index: field.selectionStart ?? field.value.length,
    source: field.value,
  };
}

export function useDesktopTranscriptionSplitController(input: {
  locale: Locale;
  sessionId: string | null;
  textLayerId: string | null;
  units: readonly SplitUnit[];
  draft: { unitId: string; text: string } | null;
  desktopCall: ((sessionId: string, method: string, args: unknown) => Promise<unknown>) | undefined;
  playheadSec: () => number;
  prepareText?: () => Promise<boolean>;
  onCommitted?: () => void;
  reload: () => Promise<unknown>;
}) {
  const [offer, setOffer] = useState<{
    unitId: string;
    time: number;
    preview: SplitTextPreview;
    activeLayerId: string;
    cutIndex: number;
    sessionId: string;
  } | null>(null);
  const toast = useToast();
  const live = useRef(input);
  live.current = input;
  const caret = useRef<SplitCaret | null>(null);
  const askLatest = useRef<(unitId: string, at: number | 'playhead') => void>(() => undefined);

  async function ask(unitId: string, at: number | 'playhead') {
    const current = live.current;
    const sessionId = current.sessionId;
    const textLayerId = current.textLayerId;
    const desktopCall = current.desktopCall;
    const unit = current.units.find((item) => item.id === unitId);
    if (!unit || sessionId === null || textLayerId === null || !desktopCall) return;
    const seconds = at === 'playhead' ? current.playheadSec() : at;
    const timeMs = Math.round(seconds * 1000);
    const liveField = caretFrom(document.activeElement);
    const marked = liveField ?? caret.current;
    const markedSource =
      liveField !== null
        ? liveField
        : marked && current.draft?.unitId === textKey(marked.layerId, marked.unitId)
          ? { ...marked, source: current.draft.text }
          : marked;
    const activeSource =
      current.draft?.unitId === textKey(textLayerId, unitId) ? current.draft.text : unit.text;
    const plan = splitOpen({
      timeMs,
      startMs: Math.round(unit.startTime * 1000),
      endMs: Math.round(unit.endTime * 1000),
      unitId,
      activeLayerId: textLayerId,
      activeSource,
      caret: markedSource,
    });
    if (!plan.ok) {
      toast.showToast(
        t(
          current.locale,
          plan.reason === 'outside'
            ? 'app.desktopTranscription.splitOutside'
            : 'app.desktopTranscription.splitTooClose',
        ),
        'error',
      );
      return;
    }
    try {
      if (current.prepareText && !(await current.prepareText()))
        throw new Error('text save incomplete');
      const preview = (await desktopCall(sessionId, 'units.splitPreview', {
        unitId,
      })) as SplitTextPreview | null;
      if (preview?.layers && preview.layers.length > 1) {
        if (live.current.sessionId !== sessionId) return;
        const source = preview.layers.find((row) => row.layerId === plan.textLayerId)?.body ?? '';
        setOffer({
          unitId,
          time: timeMs,
          sessionId,
          preview,
          activeLayerId: plan.textLayerId,
          cutIndex: plan.source === source ? Math.min(plan.cutIndex, source.length) : source.length,
        });
        return;
      }
    } catch {
      toast.showToast(t(current.locale, 'app.desktopTranscription.splitFailed'), 'error');
      return;
    }
    const operationId = globalThis.crypto.randomUUID();
    const args = {
      unitId,
      time: timeMs,
      textLayerId: plan.textLayerId,
      cutIndex: plan.cutIndex,
      rawInput: plan.source,
      operationId,
    };
    try {
      if (plan.source !== unit.text) {
        await desktopCall(sessionId, 'units.putTextDraft', {
          unitId,
          textLayerId: plan.textLayerId,
          rawInput: plan.source,
          baseBody: unit.text,
        });
      }
      const split = (await desktopCall(sessionId, 'units.split', args)) as {
        recordingCount?: number;
      };
      if ((split.recordingCount ?? 0) > 0) {
        toast.showToast(
          tf(current.locale, 'app.desktopTranscription.splitRecordingsLeft', {
            count: split.recordingCount!,
          }),
          'info',
        );
      }
    } catch (error) {
      try {
        const found = (await desktopCall(sessionId, 'units.inspectEdit', {
          operationId,
          kind: 'split',
          payload: {
            unitId,
            time: timeMs,
            textLayerId: plan.textLayerId,
            cutIndex: plan.cutIndex,
            rawInput: plan.source,
          },
        })) as { status?: string };
        if (found.status !== 'committed') throw error;
      } catch {
        toast.showToast(t(current.locale, 'app.desktopTranscription.splitFailed'), 'error');
        return;
      }
    }
    await current.reload();
  }
  askLatest.current = (unitId, at) => {
    void ask(unitId, at);
  };

  useEffect(() => {
    const remember = (event: Event) => {
      const next = caretFrom(event.target);
      if (next) caret.current = next;
    };
    document.addEventListener('keyup', remember, true);
    document.addEventListener('mouseup', remember, true);
    document.addEventListener('focusout', remember, true);
    return () => {
      document.removeEventListener('keyup', remember, true);
      document.removeEventListener('mouseup', remember, true);
      document.removeEventListener('focusout', remember, true);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 's') {
        return;
      }
      const fromEditor = caretFrom(event.target);
      if (fromEditor) caret.current = fromEditor;
      const target = event.target;
      if (
        !fromEditor &&
        annotationField(target) === null &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable))
      ) {
        return;
      }
      const page = live.current;
      const seconds = page.playheadSec();
      const unitId =
        fromEditor?.unitId ??
        page.units.find((unit) => seconds >= unit.startTime && seconds < unit.endTime)?.id;
      if (unitId === undefined) return;
      event.preventDefault();
      askLatest.current(unitId, 'playhead');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function confirm(cuts: FormalCut[]) {
    const current = live.current;
    if (!offer || current.sessionId !== offer.sessionId || !current.desktopCall) return;
    const { createDesktopClient } = await import('../app/desktopProjectReadPageAccess');
    try {
      await createDesktopClient({ desktopCall: current.desktopCall }).splitUnit(offer.sessionId, {
        unitId: offer.unitId,
        time: offer.time,
        textLayerId: offer.activeLayerId,
        baseline: offer.preview.baseline,
        formalCuts: cuts,
      });
      setOffer(null);
      current.onCommitted?.();
      await current.reload();
    } catch {
      toast.showToast(t(current.locale, 'app.desktopTranscription.splitFailed'), 'error');
    }
  }
  return {
    ask,
    dialog:
      offer === null ? null : (
        <DesktopTranscriptionSplitDialog
          locale={input.locale}
          preview={offer.preview}
          activeLayerId={offer.activeLayerId}
          cutIndex={offer.cutIndex}
          onCancel={() => setOffer(null)}
          onConfirm={(cuts) => void confirm(cuts)}
        />
      ),
  };
}
