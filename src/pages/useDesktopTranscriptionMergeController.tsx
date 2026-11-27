import { useEffect, useRef, useState } from 'react';
import { t, type Locale } from '../i18n';
import { useToast } from '../contexts/ToastContext';
import {
  DesktopTranscriptionMergeDialog,
  type MergePreviewView,
} from './DesktopTranscriptionMergeDialog';
import {
  mergeFrozenText,
  mergeTargetIds,
  freezeMergeOffer,
  sameMergeEditor,
  sameMergePair,
  sameMergeText,
  type MergeFrozenText,
  type MergeSourceUnit,
} from './desktopTranscriptionMerge';
import type { ViewScopeWrite } from '../app/desktopProjectReadPageAccess';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';

interface Offer {
  preview: MergePreviewView;
  frozen: MergeFrozenText;
  filterRevision: string;
}

export function useDesktopTranscriptionMergeController(input: {
  locale: Locale;
  sessionId: string | null;
  units: readonly MergeSourceUnit[];
  selectedUnitId: string | null;
  selectedUnitIds?: readonly string[];
  textLayerId: string | null;
  textOf: (unitId: string) => string;
  prepareText: () => Promise<boolean>;
  onCommitted?: () => void;
  desktopCall: ((sessionId: string, method: string, args: unknown) => Promise<unknown>) | undefined;
  reload: () => Promise<unknown>;
  /** Set when a speakers filter would hide merge dependents (Pixso 124:1 toast). */
  mergeBlockedByFilter?: boolean;
  /** Local filter revision; confirm aborts when it drifts after preview. */
  filterRevision?: string;
  writeScope?: (affectedUnitIds: readonly string[]) => ViewScopeWrite;
  /** Direct children of removeId (merge reparents them). */
  childIdsOf?: (unitId: string) => readonly string[];
}) {
  const { showToast } = useToast();
  const live = useRef(input);
  live.current = input;
  const [offer, setOffer] = useState<Offer | null>(null);
  const askLatest = useRef<(unitId: string) => void>(() => undefined);
  const flight = useRef(0);

  async function ask(unitId: string) {
    const current = live.current;
    if (current.mergeBlockedByFilter === true) {
      showToast(t(current.locale, 'app.desktopTranscription.mergeBlockedByFilter'), 'error');
      return;
    }
    const ids = mergeTargetIds(current.units, current.selectedUnitIds, unitId);
    const next = ids?.[ids.length - 1];
    const desktopCall = current.desktopCall;
    if (next === undefined || current.sessionId === null || !desktopCall) return;
    try {
      // Finish blur/idle saves before freezing the database baseline.
      if (!(await current.prepareText())) throw new Error('text save incomplete');
      if (
        live.current.sessionId !== current.sessionId ||
        live.current.textLayerId !== current.textLayerId
      )
        return;
      const preview = (await desktopCall(current.sessionId, 'units.mergePreview', {
        keepId: ids![0],
        removeId: next,
        ...(ids!.length > 2 ? { unitIds: ids } : {}),
      })) as MergePreviewView;
      const now = live.current;
      if (now.sessionId === null || now.textLayerId !== current.textLayerId) return;
      setOffer(freezeMergeOffer(preview, now));
    } catch {
      showToast(t(current.locale, 'app.desktopTranscription.mergeFailed'), 'error');
    }
  }
  askLatest.current = (unitId) => {
    void ask(unitId);
  };

  async function confirm(
    discardAudioIds: string[],
    textOverrides: { layerId: string; text: string }[],
  ) {
    const current = live.current;
    const open = offer;
    const desktopCall = current.desktopCall;
    if (open === null || current.sessionId === null || !desktopCall) return;
    const seen = freezeMergeOffer(open.preview, current).frozen;
    if (!sameMergeText(seen, open.frozen)) return;
    const sessionId = current.sessionId;
    const layerId = current.textLayerId;
    const discard = [...discardAudioIds].sort();
    const mine = flight.current;
    const pair = {
      keepId: open.preview.keepId,
      removeId: open.preview.removeId,
      ...(open.preview.unitIds && open.preview.unitIds.length > 2
        ? { unitIds: open.preview.unitIds }
        : {}),
    };
    const showStale = (preview: MergePreviewView) => {
      const now = live.current;
      setOffer(freezeMergeOffer(preview, now));
      showToast(t(now.locale, 'app.desktopTranscription.mergeStale'), 'error');
    };
    const hold = async (): Promise<boolean> => {
      const now = live.current;
      if (sameMergeEditor(now, sessionId, layerId, open.frozen, open.preview)) return false;
      const call = now.desktopCall;
      if (now.sessionId === null || call === undefined || mine !== flight.current) return true;
      const preview = (await call(now.sessionId, 'units.mergePreview', pair)) as MergePreviewView;
      if (mine !== flight.current) return true;
      setOffer(freezeMergeOffer(preview, live.current));
      return true;
    };
    try {
      const bare = (await desktopCall(sessionId, 'units.mergePreview', pair)) as MergePreviewView;
      if (mine !== flight.current || (await hold())) return;
      if (bare.baseline !== open.preview.baseline || !sameMergePair(open.preview, bare)) {
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
        if (!sameMergePair(bare, fresh)) {
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
        !sameMergeEditor(now, sessionId, layerId, open.frozen, open.preview)
      ) {
        return;
      }
      if ((now.filterRevision ?? '') !== open.filterRevision) {
        showToast(t(now.locale, 'app.desktopTranscription.mergeStale'), 'error');
        setOffer(null);
        return;
      }
      const text = freezeMergeOffer(open.preview, now).frozen;
      const affected = [
        ...(open.preview.unitIds ?? [open.preview.keepId, open.preview.removeId]),
        ...(open.preview.unitIds ?? [open.preview.keepId, open.preview.removeId]).flatMap(
          (id) => now.childIdsOf?.(id) ?? [],
        ),
      ];
      const scope = now.writeScope?.(affected) ?? {};
      await createDesktopClient({ desktopCall: now.desktopCall }).mergeUnits(now.sessionId, {
        ...pair,
        separator: ' ',
        baseline,
        ...scope,
        ...(textOverrides.length === 0 ? {} : { textOverrides }),
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
    current.onCommitted?.();
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
    offer === null
      ? null
      : mergeFrozenText(
          input.textOf,
          offer.preview.keepId,
          offer.preview.removeId,
          offer.preview.unitIds,
        );
  const stale = offer !== null && seen !== null && !sameMergeText(seen, offer.frozen);
  const seenKeep = seen?.keep;
  const seenRemove = seen?.remove;
  useEffect(() => {
    if (!stale || offer === null || seenKeep === undefined || seenRemove === undefined) return;
    const current = live.current;
    const desktopCall = current.desktopCall;
    if (current.sessionId === null || desktopCall === undefined) return;
    let dead = false;
    const next = mergeFrozenText(
      current.textOf,
      offer.preview.keepId,
      offer.preview.removeId,
      offer.preview.unitIds,
    );
    void current
      .prepareText()
      .then((saved) => {
        if (!saved) throw new Error('text save incomplete');
        if (dead) return null;
        return desktopCall(current.sessionId!, 'units.mergePreview', {
          ...(offer.preview.unitIds && offer.preview.unitIds.length > 2
            ? { unitIds: offer.preview.unitIds }
            : {}),
          keepId: offer.preview.keepId,
          removeId: offer.preview.removeId,
        });
      })
      .then((value) => {
        if (dead) return;
        setOffer({
          preview: value as MergePreviewView,
          frozen: next,
          filterRevision: live.current.filterRevision ?? '',
        });
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
        onConfirm={(discardAudioIds, textOverrides) => {
          void confirm(discardAudioIds, textOverrides);
        }}
      />
    );

  return {
    dialog,
    canMerge: (unitId: string) =>
      live.current.mergeBlockedByFilter !== true &&
      mergeTargetIds(live.current.units, live.current.selectedUnitIds, unitId) !== null,
    ask,
  };
}
