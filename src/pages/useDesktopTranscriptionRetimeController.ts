import { useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import type { ViewScopeWrite } from '../app/desktopProjectReadPageAccess';
import { useToast } from '../contexts/ToastContext';
import { t, type Locale } from '../i18n';

export function parseRetimeFields(
  offsetRaw: string,
  scaleRaw: string,
): { ok: true; offsetMs: number; scale: number } | { ok: false } {
  const offsetMs = Number(offsetRaw.trim());
  const scale = Number(scaleRaw.trim());
  if (!Number.isInteger(offsetMs) || !Number.isFinite(scale) || !(scale > 0)) {
    return { ok: false };
  }
  return { ok: true, offsetMs, scale };
}

/** Whole-manuscript retime dialog state and submit (6b viewScope). */
export function useDesktopTranscriptionRetimeController(input: {
  locale: Locale;
  sessionId: string | null;
  manuscriptId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  filtering: boolean;
  writeScope: () => ViewScopeWrite;
  reload: () => Promise<unknown>;
}) {
  const toast = useToast();
  const live = useRef(input);
  live.current = input;
  const [open, setOpen] = useState(false);
  const [offsetRaw, setOffsetRaw] = useState('0');
  const [scaleRaw, setScaleRaw] = useState('1');

  function ask() {
    const current = live.current;
    if (current.manuscriptId === null || current.sessionId === null) return;
    if (current.filtering) {
      toast.showToast(t(current.locale, 'app.desktopTranscription.writeBlockedByFilter'), 'error');
      return;
    }
    setOffsetRaw('0');
    setScaleRaw('1');
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  async function confirm() {
    const current = live.current;
    if (
      current.manuscriptId === null ||
      current.sessionId === null ||
      current.desktopCall === undefined
    ) {
      return;
    }
    if (current.filtering) {
      toast.showToast(t(current.locale, 'app.desktopTranscription.writeBlockedByFilter'), 'error');
      setOpen(false);
      return;
    }
    const parsed = parseRetimeFields(offsetRaw, scaleRaw);
    if (!parsed.ok) {
      toast.showToast(t(current.locale, 'app.desktopTranscription.retimeInvalid'), 'error');
      return;
    }
    try {
      await createDesktopClient({ desktopCall: current.desktopCall }).retimeManuscript(
        current.sessionId,
        {
          manuscriptId: current.manuscriptId,
          offsetMs: parsed.offsetMs,
          scale: parsed.scale,
          ...current.writeScope(),
        },
      );
      setOpen(false);
      await current.reload();
    } catch {
      toast.showToast(t(current.locale, 'app.desktopTranscription.retimeInvalid'), 'error');
    }
  }

  return {
    open,
    offsetRaw,
    scaleRaw,
    setOffsetRaw,
    setScaleRaw,
    ask,
    close,
    confirm,
  };
}
