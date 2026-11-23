import { useEffect, useRef, useState } from 'react';
import { t, type Locale } from '../i18n';
import { useToast } from '../contexts/ToastContext';
import {
  DesktopTranscriptionMergeDialog,
  type MergePreviewView,
} from './DesktopTranscriptionMergeDialog';
import { nextMergeId, timedUnits, type MergeSourceUnit } from './desktopTranscriptionMerge';

interface FrozenText {
  keep: string;
  remove: string;
}

interface Offer {
  preview: MergePreviewView;
  frozen: FrozenText;
}

function frozenText(
  textOf: (unitId: string) => string,
  keepId: string,
  removeId: string,
): FrozenText {
  return { keep: textOf(keepId), remove: textOf(removeId) };
}

function sameText(left: FrozenText, right: FrozenText): boolean {
  return left.keep === right.keep && left.remove === right.remove;
}

function sameEditor(
  now: {
    sessionId: string | null;
    textLayerId: string | null;
    textOf: (unitId: string) => string;
  },
  sessionId: string,
  textLayerId: string | null,
  frozen: FrozenText,
  preview: { keepId: string; removeId: string },
): boolean {
  const text = frozenText(now.textOf, preview.keepId, preview.removeId);
  return now.sessionId === sessionId && now.textLayerId === textLayerId && sameText(text, frozen);
}

export function useDesktopTranscriptionMergeController(input: {
  locale: Locale;
  sessionId: string | null;
  units: readonly MergeSourceUnit[];
  selectedUnitId: string | null;
  textLayerId: string | null;
  textOf: (unitId: string) => string;
  prepareText: () => Promise<boolean>;
  desktopCall: ((sessionId: string, method: string, args: unknown) => Promise<unknown>) | undefined;
  reload: () => Promise<unknown>;
}) {
  const { showToast } = useToast();
  const live = useRef(input);
  live.current = input;
  const [offer, setOffer] = useState<Offer | null>(null);
  const askLatest = useRef<(unitId: string) => void>(() => undefined);
  const flight = useRef(0);

  async function ask(unitId: string) {
    const current = live.current;
    const next = nextMergeId(timedUnits(current.units), unitId);
    const desktopCall = current.desktopCall;
    if (next === null || current.sessionId === null || !desktopCall) return;
    try {
      // Finish blur/idle saves before freezing the database baseline.
      if (!(await current.prepareText())) throw new Error('text save incomplete');
      if (
        live.current.sessionId !== current.sessionId ||
        live.current.textLayerId !== current.textLayerId
      )
        return;
      const preview = (await desktopCall(current.sessionId, 'units.mergePreview', {
        keepId: unitId,
        removeId: next,
      })) as MergePreviewView;
      const now = live.current;
      if (now.sessionId === null || now.textLayerId !== current.textLayerId) return;
      setOffer({
        preview,
        frozen: frozenText(now.textOf, preview.keepId, preview.removeId),
      });
    } catch {
      showToast(t(current.locale, 'app.desktopTranscription.mergeFailed'), 'error');
    }
  }
  askLatest.current = (unitId) => {
    void ask(unitId);
  };

  async function confirm(separator: string, discardAudioIds: string[]) {
    const current = live.current;
    const open = offer;
    const desktopCall = current.desktopCall;
    if (open === null || current.sessionId === null || !desktopCall) return;
    const seen = frozenText(current.textOf, open.preview.keepId, open.preview.removeId);
    if (!sameText(seen, open.frozen)) return;
    const sessionId = current.sessionId;
    const layerId = current.textLayerId;
    const operationId = globalThis.crypto.randomUUID();
    const discard = [...discardAudioIds].sort();
    const mine = flight.current;
    const pair = { keepId: open.preview.keepId, removeId: open.preview.removeId };
    const showStale = (preview: MergePreviewView) => {
      const now = live.current;
      setOffer({
        preview,
        frozen: frozenText(now.textOf, preview.keepId, preview.removeId),
      });
      showToast(t(now.locale, 'app.desktopTranscription.mergeStale'), 'error');
    };
    const hold = async (): Promise<boolean> => {
      const now = live.current;
      if (sameEditor(now, sessionId, layerId, open.frozen, open.preview)) return false;
      const call = now.desktopCall;
      if (now.sessionId === null || call === undefined || mine !== flight.current) return true;
      const preview = (await call(now.sessionId, 'units.mergePreview', pair)) as MergePreviewView;
      if (mine !== flight.current) return true;
      const fresh = live.current;
      setOffer({
        preview,
        frozen: frozenText(fresh.textOf, preview.keepId, preview.removeId),
      });
      return true;
    };
    try {
      const bare = (await desktopCall(sessionId, 'units.mergePreview', pair)) as MergePreviewView;
      if (mine !== flight.current || (await hold())) return;
      if (bare.baseline !== open.preview.baseline || !samePair(open.preview, bare)) {
        showStale(bare);
        return;
      }
      let baseline = bare.baseline;
      if (discard.length > 0) {
        const fresh = (await desktopCall(sessionId, 'units.mergePreview', {
          ...pair,
          discardAudioIds: discard,
        })) as MergePreviewView;
        if (mine !== flight.current || (await hold())) return;
        if (!samePair(bare, fresh)) {
          showStale(bare);
          return;
        }
        baseline = fresh.baseline;
      }
      if (await hold()) return;
      const now = live.current;
      if (
        now.sessionId === null ||
        now.desktopCall === undefined ||
        !sameEditor(now, sessionId, layerId, open.frozen, open.preview)
      ) {
        return;
      }
      const text = frozenText(now.textOf, open.preview.keepId, open.preview.removeId);
      await now.desktopCall(now.sessionId, 'units.merge', {
        ...pair,
        separator,
        baseline,
        operationId,
        ...(discard.length === 0 ? {} : { discardAudioIds: discard }),
        ...(now.textLayerId === null
          ? {}
          : {
              textLayerId: now.textLayerId,
              keepText: text.keep,
              removeText: text.remove,
            }),
      });
    } catch {
      if (mine !== flight.current) return;
      showToast(t(current.locale, 'app.desktopTranscription.mergeFailed'), 'error');
      return;
    }
    setOffer(null);
    await current.reload();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'm') return;
      const page = live.current;
      if (offer) {
        event.preventDefault();
        return;
      }
      const target = event.target;
      const field =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const annotation =
        target instanceof HTMLElement && target.closest('.timeline-annotation-input') !== null;
      if (field && !annotation) return;
      event.preventDefault();
      const unitId = page.selectedUnitId;
      if (unitId === null) return;
      askLatest.current(unitId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offer]);

  const seen =
    offer === null ? null : frozenText(input.textOf, offer.preview.keepId, offer.preview.removeId);
  const stale = offer !== null && seen !== null && !sameText(seen, offer.frozen);
  const seenKeep = seen?.keep;
  const seenRemove = seen?.remove;
  useEffect(() => {
    if (!stale || offer === null || seenKeep === undefined || seenRemove === undefined) return;
    const current = live.current;
    const desktopCall = current.desktopCall;
    if (current.sessionId === null || desktopCall === undefined) return;
    let dead = false;
    const next = { keep: seenKeep, remove: seenRemove };
    void current
      .prepareText()
      .then((saved) => {
        if (!saved) throw new Error('text save incomplete');
        if (dead) return null;
        return desktopCall(current.sessionId!, 'units.mergePreview', {
          keepId: offer.preview.keepId,
          removeId: offer.preview.removeId,
        });
      })
      .then((value) => {
        if (dead) return;
        setOffer({ preview: value as MergePreviewView, frozen: next });
      })
      .catch(() => {
        if (!dead) {
          showToast(t(current.locale, 'app.desktopTranscription.mergeFailed'), 'error');
        }
      });
    return () => {
      dead = true;
    };
  }, [stale, seenKeep, seenRemove, offer, showToast]);
  const dialog =
    offer === null || input.sessionId === null || input.desktopCall === undefined ? null : (
      <DesktopTranscriptionMergeDialog
        locale={input.locale}
        sessionId={input.sessionId}
        preview={offer.preview}
        stale={stale}
        desktopCall={input.desktopCall}
        onCancel={() => {
          flight.current += 1;
          setOffer(null);
        }}
        onConfirm={(separator, discardAudioIds) => {
          void confirm(separator, discardAudioIds);
        }}
      />
    );

  return {
    dialog,
    canMerge: (unitId: string) => nextMergeId(timedUnits(live.current.units), unitId) !== null,
    ask,
  };
}

function samePair(opened: MergePreviewView, fresh: MergePreviewView): boolean {
  const ids = (preview: MergePreviewView) =>
    [...preview.earlier, ...preview.later].map((clip) => clip.id).join('\n');
  return (
    opened.keepId === fresh.keepId &&
    opened.removeId === fresh.removeId &&
    opened.gapMs === fresh.gapMs &&
    opened.noteCount === fresh.noteCount &&
    ids(opened) === ids(fresh)
  );
}
