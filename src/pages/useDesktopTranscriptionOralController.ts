import { useEffect, useRef, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { t, useLocale } from '../i18n';
import {
  holdTakeSave,
  loadOralClips,
  parkFailedTake,
  peekFailedTake,
  releaseClipUrls,
  watchFailedTake,
  type OralPinned,
} from './oralTake';
import { oralControllerApi, type OralBag, type OralUi } from './oralControllerApi';

const empty: OralUi = { live: null, save: null, level: 0, elapsed: 0 };

/** Record, play, delete, and send one short clip to local Whisper. The text stays a draft. */
export function useDesktopTranscriptionOralController(input: {
  sessionId: string | null;
  desktopCall: OralPinned['call'] | undefined;
  audioLayerIds: readonly string[];
  /** Unit ids. A merge, undo, or redo changes them and the clip cache must follow. */
  structureKey?: string;
  refresh: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const toast = useToast();
  const [takes, setTakes] = useState<Record<string, { id: string | null; url: string }[]>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const urls = useRef(takes);
  urls.current = takes;
  const [stamp, setStamp] = useState(0);
  const [ui, setUi] = useState<OralUi>(empty);
  const [ask, setAsk] = useState(false);
  const bag = useRef<OralBag>({
    latest: input,
    alive: true,
    load: 0,
    attempt: 0,
    phase: 'idle',
    recorder: null,
    stopMeter: () => {},
    intent: 'save',
    clock: 0,
    started: 0,
    accrued: 0,
    wait: null,
    resolveWait: null,
    go: null,
    cancel: null,
    saveKey: null,
    pendingSave: null,
    releaseSave: null,
  });
  bag.current.latest = input;
  bag.current.pendingSave = ui.save;
  const audioKey = input.audioLayerIds.join('\n');
  const canCall = input.desktopCall !== undefined;

  useEffect(() => {
    const ticket = ++bag.current.load;
    const current = bag.current.latest;
    let dropped = false;
    if (current.sessionId === null || current.desktopCall === undefined) {
      setTakes((previous) => {
        releaseClipUrls(previous);
        return {};
      });
      return;
    }
    const sessionId = current.sessionId;
    const call = current.desktopCall;
    void loadOralClips(sessionId, call, current.audioLayerIds).then((loaded) => {
      if (dropped || bag.current.load !== ticket) {
        for (const url of loaded.urls) URL.revokeObjectURL(url);
        return;
      }
      if (loaded.broken.length > 0) {
        toast.showToast(
          t(locale, 'app.desktopTranscription.oralClipUnreadable').replace(
            '{unit}',
            loaded.broken[0] ?? '',
          ),
          'error',
        );
      }
      setTakes((previous) => {
        for (const list of Object.values(previous)) {
          for (const take of list) {
            if (!loaded.urls.includes(take.url)) URL.revokeObjectURL(take.url);
          }
        }
        return loaded.takes;
      });
    });
    return () => {
      dropped = true;
    };
  }, [input.sessionId, input.structureKey, audioKey, stamp, canCall, locale, toast]);

  useEffect(() => {
    const state = bag.current;
    state.alive = true;
    const adopt = (parked: ReturnType<typeof peekFailedTake>) => {
      if (parked === null) return;
      setUi((current) =>
        current.save ? current : { ...current, save: { ...parked, phase: 'failed' } },
      );
    };
    adopt(peekFailedTake());
    const stopWatch = watchFailedTake(adopt);
    return () => {
      stopWatch();
      state.alive = false;
      state.stopMeter();
      window.clearInterval(state.clock);
      releaseClipUrls(urls.current);
      const failed = state.pendingSave;
      if (failed?.phase === 'failed') parkFailedTake(failed);
      const recorder = state.recorder;
      state.recorder = null;
      if (recorder && recorder.state !== 'inactive') {
        if (!state.releaseSave) state.releaseSave = holdTakeSave();
        state.intent = 'save';
        recorder.stop();
      }
    };
  }, []);

  return oralControllerApi({
    locale,
    toast,
    takes,
    picked,
    setPicked,
    ui,
    setUi,
    setAsk,
    setStamp,
    ask,
    bag,
  });
}
