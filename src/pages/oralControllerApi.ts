import { t, type Locale } from '../i18n';
import {
  clipKey,
  dropFailedTake,
  holdTakeSave,
  micKey,
  nextTakeId,
  openOralRecorder,
  oralFailure,
  parkFailedTake,
  peekFailedTake,
  persistTake,
  takeSaveHeld,
  recorderMime,
  type OralPinned,
} from './oralTake';

type Live = { attempt: number; pinned: OralPinned; phase: 'arming' | 'recording' | 'paused' };
type Save = { id: number; pinned: OralPinned; phase: 'saving' | 'failed'; bytes: Uint8Array };
export type OralUi = { live: Live | null; save: Save | null; level: number; elapsed: number };

export type OralBag = {
  latest: {
    sessionId: string | null;
    desktopCall: OralPinned['call'] | undefined;
    audioLayerIds: readonly string[];
    refresh: () => Promise<unknown>;
  };
  alive: boolean;
  load: number;
  attempt: number;
  phase: Live['phase'] | 'idle';
  recorder: MediaRecorder | null;
  stopMeter: () => void;
  intent: 'save' | 'discard';
  clock: number;
  started: number;
  accrued: number;
  wait: Promise<boolean> | null;
  resolveWait: ((ok: boolean) => void) | null;
  go: (() => void) | null;
  cancel: (() => void) | null;
  saveKey: string | null;
  pendingSave: Save | null;
  releaseSave: (() => void) | null;
};

export function oralControllerApi(ctx: {
  locale: Locale;
  toast: { showToast: (message: string, tone: 'error' | 'info') => void };
  takes: Record<string, { id: string | null; url: string }[]>;
  picked: Record<string, string>;
  setPicked: (
    value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  ui: OralUi;
  setUi: (value: OralUi | ((current: OralUi) => OralUi)) => void;
  setAsk: (value: boolean) => void;
  setStamp: (value: number | ((current: number) => number)) => void;
  ask: boolean;
  bag: { current: OralBag };
}) {
  const { locale, toast, takes, picked, setPicked, ui, setUi, setAsk, setStamp, ask, bag } = ctx;
  const elapsedNow = () =>
    bag.current.accrued +
    (bag.current.started === 0 ? 0 : Math.floor((Date.now() - bag.current.started) / 1000));

  const runClock = (on: boolean) => {
    window.clearInterval(bag.current.clock);
    if (!on) return;
    bag.current.clock = window.setInterval(() => {
      setUi((current) => ({ ...current, elapsed: elapsedNow() }));
    }, 1000);
  };

  const endWait = (ok = true) => {
    bag.current.resolveWait?.(ok);
    bag.current.resolveWait = null;
    bag.current.wait = null;
  };

  const armWait = () => {
    const pending = new Promise<boolean>((resolve) => {
      bag.current.resolveWait = resolve;
    });
    bag.current.wait = pending;
    return pending;
  };

  const pinOf = (layerId: string, unitId: string): OralPinned | null => {
    const current = bag.current.latest;
    if (current.sessionId === null || current.desktopCall === undefined) return null;
    return {
      sessionId: current.sessionId,
      call: current.desktopCall,
      unitId,
      layerId,
      key: clipKey(layerId, unitId),
      refresh: () => bag.current.latest.refresh(),
    };
  };

  const remember = (save: Save | null) => {
    bag.current.pendingSave = save;
  };

  const releaseSave = () => {
    bag.current.releaseSave?.();
    bag.current.releaseSave = null;
  };

  const armSaveHold = () => {
    if (bag.current.releaseSave) return;
    bag.current.releaseSave = holdTakeSave();
  };

  const store = (save: Save) => {
    armSaveHold();
    return persistTake(save.pinned, save.bytes).then(
      (result) => {
        dropFailedTake(save.id);
        if (bag.current.saveKey === save.pinned.key) bag.current.saveKey = null;
        const still = peekFailedTake();
        const kept = still === null ? null : { ...still, phase: 'failed' as const };
        if (bag.current.alive) {
          if (result === 'refresh') {
            toast.showToast(t(locale, 'app.desktopTranscription.oralRefreshFailed'), 'error');
          }
          if (bag.current.pendingSave?.id === save.id) remember(kept);
          setUi((current) => (current.save?.id === save.id ? { ...current, save: kept } : current));
          setStamp((value) => value + 1);
        }
        endWait(true);
        releaseSave();
        return true;
      },
      () => {
        const failed: Save = { ...save, phase: 'failed' };
        remember(failed);
        if (!bag.current.alive) parkFailedTake(failed);
        else {
          setUi((current) =>
            current.save?.id === save.id ? { ...current, save: failed } : current,
          );
          toast.showToast(t(locale, 'app.desktopTranscription.oralSaveFailed'), 'error');
        }
        endWait(false);
        releaseSave();
        return false;
      },
    );
  };

  const finish = (goOn: boolean) => {
    const go = bag.current.go;
    const cancel = bag.current.cancel;
    bag.current.go = null;
    bag.current.cancel = null;
    setAsk(false);
    if (goOn) go?.();
    else cancel?.();
  };

  return {
    paused: ui.live?.phase === 'paused',
    level: ui.level,
    elapsed: ui.elapsed,
    ask,
    saving: ui.save?.phase === 'saving',
    openLayerId: ui.live?.pinned.layerId ?? ui.save?.pinned.layerId ?? null,
    src: (layerId: string, unitId: string) => {
      const key = clipKey(layerId, unitId);
      const list = takes[key] ?? [];
      return (list.find((take) => take.id === picked[key]) ?? list[0])?.url ?? null;
    },
    clips: (layerId: string, unitId: string) => takes[clipKey(layerId, unitId)] ?? [],
    currentId: (layerId: string, unitId: string) => {
      const key = clipKey(layerId, unitId);
      const list = takes[key] ?? [];
      return list.find((take) => take.id === picked[key])?.id ?? list[0]?.id ?? null;
    },
    pick: (layerId: string, unitId: string, id: string) => {
      setPicked((current) => ({ ...current, [clipKey(layerId, unitId)]: id }));
    },
    isRecording: (layerId: string, unitId: string) =>
      ui.live !== null &&
      ui.live.pinned.key === clipKey(layerId, unitId) &&
      (ui.live.phase === 'recording' || ui.live.phase === 'paused'),
    isArming: (layerId: string, unitId: string) =>
      ui.live?.phase === 'arming' && ui.live.pinned.key === clipKey(layerId, unitId),
    isSaving: (layerId: string, unitId: string) =>
      ui.save?.phase === 'saving' && ui.save.pinned.key === clipKey(layerId, unitId),
    isFailed: (layerId: string, unitId: string) =>
      ui.save?.phase === 'failed' && ui.save.pinned.key === clipKey(layerId, unitId),
    micBusy: ui.live !== null,
    holding: ui.live !== null || ui.save !== null,
    saveLocked: ui.save !== null || takeSaveHeld() || peekFailedTake() !== null,
    start: async (layerId: string, unitId: string) => {
      if (
        bag.current.recorder ||
        bag.current.phase === 'arming' ||
        bag.current.phase === 'recording' ||
        bag.current.phase === 'paused'
      ) {
        return;
      }
      if (
        ui.save !== null ||
        bag.current.saveKey !== null ||
        peekFailedTake() !== null ||
        takeSaveHeld()
      ) {
        return;
      }
      const pinned = pinOf(layerId, unitId);
      const mime = recorderMime();
      if (pinned === null || mime === undefined) {
        toast.showToast(t(locale, 'transcription.timeline.audio.error.startFailed'), 'error');
        return;
      }
      const attempt = ++bag.current.attempt;
      bag.current.phase = 'arming';
      bag.current.intent = 'save';
      bag.current.accrued = 0;
      bag.current.started = 0;
      const nextUi = {
        live: { attempt, pinned, phase: 'arming' as const },
        save: ui.save,
        level: 0,
        elapsed: 0,
      };
      remember(nextUi.save);
      setUi(nextUi);
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!bag.current.alive || bag.current.attempt !== attempt) {
          stream.getTracks().forEach((track) => track.stop());
          if (bag.current.attempt === attempt) {
            bag.current.phase = 'idle';
            setUi((current) => ({ ...current, live: null }));
          }
          return;
        }
        const opened = openOralRecorder({
          stream,
          mime,
          current: () => bag.current.attempt === attempt,
          discard: () => bag.current.intent === 'discard',
          onLevel: (value) => {
            if (bag.current.phase === 'paused' || bag.current.attempt !== attempt) return;
            setUi((current) => ({ ...current, level: value }));
          },
          onStopping: () => {
            if (bag.current.wait === null) void armWait();
          },
          onEnded: (bytes, fault) => {
            bag.current.stopMeter();
            bag.current.stopMeter = () => {};
            bag.current.recorder = null;
            bag.current.phase = 'idle';
            runClock(false);
            if (bag.current.alive) setUi((current) => ({ ...current, live: null, level: 0 }));
            if (bag.current.intent === 'discard') {
              releaseSave();
              endWait();
              return;
            }
            bag.current.saveKey = pinned.key;
            const id = nextTakeId();
            const save: Save = { id, pinned, phase: fault ? 'failed' : 'saving', bytes };
            remember(save);
            if (bag.current.alive) setUi((current) => ({ ...current, save }));
            if (fault) {
              if (!bag.current.alive) parkFailedTake(save);
              else toast.showToast(t(locale, 'app.desktopTranscription.oralInterrupted'), 'error');
              releaseSave();
              endWait(false);
              return;
            }
            void store(save);
          },
        });
        bag.current.recorder = opened.recorder;
        bag.current.stopMeter = opened.stopMeter;
        bag.current.phase = 'recording';
        bag.current.started = Date.now();
        runClock(true);
        setUi((current) => ({
          ...current,
          live: { attempt, pinned, phase: 'recording' },
          elapsed: 0,
        }));
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        if (bag.current.attempt !== attempt) return;
        bag.current.recorder = null;
        bag.current.phase = 'idle';
        setUi((current) => ({ ...current, live: null, level: 0 }));
        toast.showToast(t(locale, micKey(error)), 'error');
      }
    },
    stop: () => {
      bag.current.intent = 'save';
      const recorder = bag.current.recorder;
      if (recorder && recorder.state !== 'inactive') {
        armSaveHold();
        recorder.stop();
      } else {
        bag.current.attempt += 1;
        bag.current.phase = 'idle';
        setUi((current) => ({ ...current, live: null }));
      }
    },
    pause: () => {
      const recorder = bag.current.recorder;
      if (!recorder || recorder.state !== 'recording') return;
      recorder.pause();
      bag.current.accrued = elapsedNow();
      bag.current.started = 0;
      bag.current.phase = 'paused';
      runClock(false);
      setUi((current) =>
        current.live === null
          ? current
          : {
              ...current,
              live: { ...current.live, phase: 'paused' },
              elapsed: bag.current.accrued,
              level: 0,
            },
      );
    },
    resume: () => {
      const recorder = bag.current.recorder;
      if (!recorder || recorder.state !== 'paused') return;
      recorder.resume();
      bag.current.started = Date.now();
      bag.current.phase = 'recording';
      runClock(true);
      setUi((current) =>
        current.live === null
          ? current
          : { ...current, live: { ...current.live, phase: 'recording' } },
      );
    },
    cancel: () => {
      bag.current.intent = 'discard';
      const recorder = bag.current.recorder;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else {
        bag.current.attempt += 1;
        bag.current.phase = 'idle';
        setUi((current) => ({ ...current, live: null, level: 0 }));
      }
    },
    retry: () => {
      const save = ui.save ?? bag.current.pendingSave;
      if (save?.phase !== 'failed') return;
      const next = { ...save, phase: 'saving' as const };
      remember(next);
      setUi((current) => ({ ...current, save: next }));
      void armWait();
      void store(next);
    },
    discardSave: () => {
      const save = ui.save ?? bag.current.pendingSave;
      if (save?.phase === 'saving') return;
      bag.current.saveKey = null;
      if (save) dropFailedTake(save.id);
      remember(null);
      setUi((current) => ({ ...current, save: null }));
    },
    leave: (go: () => void, cancel: () => void = () => {}) => {
      if (ui.live === null && ui.save === null && bag.current.pendingSave === null) {
        go();
        return;
      }
      bag.current.go = go;
      bag.current.cancel = cancel;
      setAsk(true);
    },
    saveAndLeave: () => {
      if (ui.live?.phase === 'arming') {
        bag.current.attempt += 1;
        bag.current.phase = 'idle';
        setUi((current) => ({ ...current, live: null }));
        finish(true);
        return;
      }
      if (ui.live?.phase === 'recording' || ui.live?.phase === 'paused') {
        const pending = armWait();
        bag.current.intent = 'save';
        const recorder = bag.current.recorder;
        if (recorder && recorder.state !== 'inactive') armSaveHold();
        recorder?.stop();
        void pending.then((ok) => {
          if (ok) finish(true);
        });
        return;
      }
      if (ui.save?.phase === 'failed') {
        const next = { ...ui.save, phase: 'saving' as const };
        setUi((current) => ({ ...current, save: next }));
        void armWait();
        void store(next).then((ok) => {
          if (ok) finish(true);
        });
        return;
      }
      void (bag.current.wait ?? Promise.resolve(true)).then((ok) => {
        if (ok) finish(true);
      });
    },
    discardAndLeave: () => {
      if (ui.save?.phase === 'saving') return;
      bag.current.intent = 'discard';
      const recorder = bag.current.recorder;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else bag.current.attempt += 1;
      bag.current.phase = 'idle';
      bag.current.saveKey = null;
      if (ui.save) dropFailedTake(ui.save.id);
      remember(null);
      setUi((current) => ({ ...current, live: null, save: null, level: 0 }));
      finish(true);
    },
    stay: () => finish(false),
    transcribe: async (layerId: string, unitId: string) => {
      const current = bag.current.latest;
      if (current.sessionId === null || current.desktopCall === undefined) return;
      const key = clipKey(layerId, unitId);
      if (ui.live?.pinned.key === key || ui.save?.pinned.key === key) return;
      const seen = current.sessionId;
      try {
        await current.desktopCall(seen, 'recordings.transcribe', { unitId, layerId });
        if (!bag.current.alive || bag.current.latest.sessionId !== seen) return;
        await bag.current.latest.refresh();
        toast.showToast(t(locale, 'app.desktopTranscription.oralDraftReady'), 'info');
      } catch (error) {
        if (!bag.current.alive || bag.current.latest.sessionId !== seen) return;
        toast.showToast(t(locale, oralFailure(error)), 'error');
      }
    },
    remove: async (layerId: string, unitId: string) => {
      const key = clipKey(layerId, unitId);
      if (bag.current.recorder || ui.save?.pinned.key === key) return;
      const current = bag.current.latest;
      if (current.sessionId === null || current.desktopCall === undefined) return;
      const list = takes[key] ?? [];
      const chosen = list.find((take) => take.id === picked[key]) ?? list[0];
      const index = chosen === undefined ? -1 : list.indexOf(chosen);
      const follow = list[index + 1] ?? list[index - 1];
      try {
        await current.desktopCall(
          current.sessionId,
          'recordings.detach',
          chosen?.id === undefined || chosen.id === null
            ? { unitId, layerId }
            : { unitId, layerId, audioId: chosen.id },
        );
        const nextId = follow?.id;
        if (nextId) setPicked((prev) => ({ ...prev, [key]: nextId }));
        await current.refresh();
        setStamp((value) => value + 1);
      } catch {
        toast.showToast(t(locale, 'app.desktopTranscription.layerActionFailed'), 'error');
      }
    },
  };
}
