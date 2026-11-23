import { useEffect, useRef, useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, type Locale } from '../i18n';
import { useToast } from '../contexts/ToastContext';
import { textKey } from './desktopTranscriptionTextKey';

const MIN_SPLIT_MS = 10;

interface SplitUnit {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface Prompt {
  unitId: string;
  timeMs: number;
  textLayerId: string;
  source: string;
  cutIndex: number;
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

function caretFrom(target: EventTarget | null): SplitCaret | null {
  if (!(target instanceof HTMLInputElement)) return null;
  if (!target.classList.contains('timeline-annotation-input')) return null;
  const unitId = target.closest('[data-unit-id]')?.getAttribute('data-unit-id');
  const layerId = target.closest('[data-layer-id]')?.getAttribute('data-layer-id');
  if (!unitId || !layerId || target.selectionStart === null) return null;
  return { layerId, unitId, index: target.selectionStart, source: target.value };
}

export function useDesktopTranscriptionSplitController(input: {
  locale: Locale;
  sessionId: string | null;
  textLayerId: string | null;
  units: readonly SplitUnit[];
  draft: { unitId: string; text: string } | null;
  desktopCall: ((sessionId: string, method: string, args: unknown) => Promise<unknown>) | undefined;
  playheadSec: () => number;
  reload: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const live = useRef(input);
  live.current = input;
  const caret = useRef<SplitCaret | null>(null);
  const askLatest = useRef<(unitId: string, at: number | 'playhead') => void>(() => undefined);

  function ask(unitId: string, at: number | 'playhead') {
    const current = live.current;
    const unit = current.units.find((item) => item.id === unitId);
    if (
      !unit ||
      current.sessionId === null ||
      current.textLayerId === null ||
      !current.desktopCall
    ) {
      return;
    }
    const seconds = at === 'playhead' ? current.playheadSec() : at;
    const timeMs = Math.round(seconds * 1000);
    const marked = caret.current;
    const markedSource =
      marked && current.draft?.unitId === textKey(marked.layerId, marked.unitId)
        ? { ...marked, source: current.draft.text }
        : marked;
    const activeSource =
      current.draft?.unitId === textKey(current.textLayerId, unitId)
        ? current.draft.text
        : unit.text;
    const plan = splitOpen({
      timeMs,
      startMs: Math.round(unit.startTime * 1000),
      endMs: Math.round(unit.endTime * 1000),
      unitId,
      activeLayerId: current.textLayerId,
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
    setPrompt({
      unitId,
      timeMs,
      textLayerId: plan.textLayerId,
      source: plan.source,
      cutIndex: plan.cutIndex,
    });
  }
  askLatest.current = ask;

  async function confirm() {
    const current = prompt;
    const page = live.current;
    if (!current || page.sessionId === null || !page.desktopCall) return;
    const operationId = globalThis.crypto.randomUUID();
    const args = {
      unitId: current.unitId,
      time: current.timeMs,
      textLayerId: current.textLayerId,
      cutIndex: current.cutIndex,
      rawInput: current.source,
      operationId,
    };
    try {
      await page.desktopCall(page.sessionId, 'units.split', args);
    } catch (error) {
      try {
        const found = (await page.desktopCall(page.sessionId, 'units.inspectEdit', {
          operationId,
          kind: 'split',
          payload: {
            unitId: current.unitId,
            time: current.timeMs,
            textLayerId: current.textLayerId,
            cutIndex: current.cutIndex,
            rawInput: current.source,
          },
        })) as { status?: string };
        if (found.status !== 'committed') throw error;
      } catch {
        toast.showToast(t(page.locale, 'app.desktopTranscription.splitFailed'), 'error');
        return;
      }
    }
    setPrompt(null);
    await page.reload();
  }

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

  return {
    ask,
    prompt,
    setCutIndex: (cutIndex: number) =>
      setPrompt((current) => (current === null ? current : { ...current, cutIndex })),
    confirm: () => void confirm(),
    cancel: () => setPrompt(null),
  };
}

function SplitPreview(props: {
  label: string;
  source: string;
  cutIndex: number;
  onCutIndex: (cutIndex: number) => void;
}) {
  const placed = useRef(false);
  return (
    <textarea
      aria-label={props.label}
      value={props.source}
      readOnly
      ref={(node) => {
        if (!node || placed.current) return;
        placed.current = true;
        node.setSelectionRange(props.cutIndex, props.cutIndex);
      }}
      onSelect={(event) =>
        props.onCutIndex(event.currentTarget.selectionStart ?? props.source.length)
      }
      onKeyUp={(event) =>
        props.onCutIndex(event.currentTarget.selectionStart ?? props.source.length)
      }
      onClick={(event) =>
        props.onCutIndex(event.currentTarget.selectionStart ?? props.source.length)
      }
    />
  );
}

export function DesktopTranscriptionSplitDialog(props: {
  locale: Locale;
  prompt: Prompt | null;
  onCutIndex: (cutIndex: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (props.prompt === null) return null;
  const { prompt } = props;
  return (
    <ModalPanel
      isOpen
      compact
      className="desktop-tx-delete"
      closeLabel={t(props.locale, 'app.desktopTranscription.cancel')}
      onClose={props.onCancel}
      title={t(props.locale, 'app.desktopTranscription.splitSegment')}
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={props.onConfirm}>
            {t(props.locale, 'app.desktopTranscription.splitConfirm')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={props.onCancel}>
            {t(props.locale, 'app.desktopTranscription.cancel')}
          </button>
        </>
      }
    >
      <p>{t(props.locale, 'app.desktopTranscription.splitOtherLayers')}</p>
      <SplitPreview
        label={t(props.locale, 'app.desktopTranscription.splitSegment')}
        source={prompt.source}
        cutIndex={prompt.cutIndex}
        onCutIndex={props.onCutIndex}
      />
    </ModalPanel>
  );
}
