import { useEffect, useMemo, useRef, useState } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { ViewScopeWrite } from '../app/desktopProjectReadPageAccess';
import { useToast } from '../contexts/ToastContext';
import { t, tf, useLocale } from '../i18n';
import {
  laneLockRow,
  layoutSpeakerLane,
  readLaneModes,
  speakerMenuOrder,
  type SpeakerLaneLayout,
  type SpeakerLaneMode,
} from './desktopSpeakerLanes';

const MODE_KEY = 'jieyu.desktop.laneMode.';

interface LaneUnit {
  id: string;
  startMs: number | null;
  endMs: number | null;
  speakerId: string | null;
  updatedAt: string;
}

interface LaneLayer {
  id: string;
  units: readonly LaneUnit[];
}

interface LaneLockRow {
  layerId: string;
  speakerId: string;
  laneIndex: number;
}

/** Local layout plus the explicit lock writes. The page only passes this through. */
export function useDesktopTranscriptionLaneController(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  manuscriptId: string | null;
  layers: readonly LaneLayer[] | undefined;
  selectedUnitId: string | null;
  refresh: () => Promise<unknown>;
  selectedUnitIds?: readonly string[];
  writeScope?: (affectedUnitIds: readonly string[]) => ViewScopeWrite;
}) {
  const locale = useLocale();
  const toast = useToast();
  const [modes, setModes] = useState<Record<string, SpeakerLaneMode>>({});
  const [locks, setLocks] = useState<Record<string, Record<string, number>>>({});
  const [cycle, setCycle] = useState<Record<string, number>>({});
  const [speakers, setSpeakers] = useState<{ id: string; name: string }[]>([]);
  const latest = useRef(input);
  latest.current = input;
  const toasted = useRef('');

  const catalogRevision = (input.layers ?? [])
    .flatMap((layer) => layer.units.map((unit) => unit.speakerId ?? ''))
    .join(',');
  useEffect(() => {
    const manuscriptId = input.manuscriptId;
    setModes(manuscriptId === null ? {} : readLaneModes(readMode(manuscriptId)));
    setCycle({});
    const sessionId = input.sessionId;
    const call = input.desktopCall;
    if (manuscriptId === null || sessionId === null || call === undefined) {
      setLocks({});
      setSpeakers([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      call(sessionId, 'layers.listLaneLocks', { manuscriptId }) as Promise<LaneLockRow[]>,
      call(sessionId, 'speakers.list', {}) as Promise<{ id: string; name: string }[]>,
    ])
      .then(([rows, listed]) => {
        if (cancelled) return;
        const next: Record<string, Record<string, number>> = {};
        for (const row of rows) {
          next[row.layerId] = { ...next[row.layerId], [row.speakerId]: row.laneIndex };
        }
        setLocks(next);
        setSpeakers(listed.map((speaker) => ({ id: speaker.id, name: speaker.name })));
      })
      .catch(() => {
        if (!cancelled)
          toast.showToast(t(locale, 'app.desktopTranscription.layerActionFailed'), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [input.desktopCall, input.manuscriptId, input.sessionId, catalogRevision, locale, toast]);

  const layouts = useMemo(() => {
    const out = new Map<string, SpeakerLaneLayout>();
    for (const layer of input.layers ?? []) {
      out.set(
        layer.id,
        layoutSpeakerLane(
          layer.units.flatMap((unit) =>
            unit.startMs === null || unit.endMs === null
              ? []
              : [
                  {
                    id: unit.id,
                    startTime: unit.startMs / 1000,
                    endTime: unit.endMs / 1000,
                    speakerId: unit.speakerId,
                  },
                ],
          ),
          modes[layer.id] ?? 'single',
          locks[layer.id] ?? {},
          cycle[layer.id] ?? 0,
        ),
      );
    }
    return out;
  }, [cycle, input.layers, locks, modes]);

  useEffect(() => {
    const names: string[] = [];
    const ids: string[] = [];
    for (const layout of layouts.values()) {
      for (const speakerId of layout.conflictSpeakerIds) {
        if (ids.includes(speakerId)) continue;
        ids.push(speakerId);
        names.push(speakers.find((speaker) => speaker.id === speakerId)?.name ?? speakerId);
      }
    }
    const key = ids.join(',');
    if (key === '') {
      toasted.current = '';
      return;
    }
    if (key === toasted.current) return;
    toasted.current = key;
    toast.showToast(
      tf(locale, 'app.desktopTranscription.laneConflict', { name: names.join('、') }),
      'error',
    );
  }, [layouts, locale, speakers, toast]);

  return useMemo(() => {
    const fail = (error: unknown) => {
      const message = error instanceof Error ? error.message : '';
      toast.showToast(
        t(
          locale,
          message.includes('same speaker intervals overlap')
            ? 'app.desktopTranscription.speakerOverlap'
            : message.includes('lane index repeats')
              ? 'app.desktopTranscription.laneLockRepeat'
              : 'app.desktopTranscription.layerActionFailed',
        ),
        'error',
      );
    };
    const run = async (method: string, args: unknown) => {
      const current = latest.current;
      if (
        current.sessionId === null ||
        current.desktopCall === undefined ||
        current.manuscriptId === null
      ) {
        return;
      }
      const api = createDesktopClient({ desktopCall: current.desktopCall });
      if (method === 'speakers.assign')
        await api.assignSpeaker(
          current.sessionId,
          args as { speakerId: string; unitIds: string[] } & ViewScopeWrite,
        );
      else if (method === 'speakers.clear')
        await api.clearSpeaker(current.sessionId, args as { unitIds: string[] } & ViewScopeWrite);
      else await current.desktopCall(current.sessionId, method, args);
      const rows = (await current.desktopCall(current.sessionId, 'layers.listLaneLocks', {
        manuscriptId: current.manuscriptId,
      })) as LaneLockRow[];
      const next: Record<string, Record<string, number>> = {};
      for (const row of rows)
        next[row.layerId] = { ...next[row.layerId], [row.speakerId]: row.laneIndex };
      setLocks(next);
      await current.refresh();
      if (method === 'speakers.assign' || method === 'speakers.clear')
        toast.showToast(t(locale, 'app.desktopTranscription.speakerAssignedUndo'), 'success');
    };
    return {
      speakers,
      layoutOf: (layerId: string) => layouts.get(layerId),
      modeOf: (layerId: string): SpeakerLaneMode => modes[layerId] ?? 'single',
      nameOf: (speakerId: string | null) =>
        speakerId === null
          ? ''
          : (speakers.find((speaker) => speaker.id === speakerId)?.name ?? ''),
      menu: speakerMenuOrder(
        speakers,
        (input.layers ?? []).flatMap((layer) => layer.units),
      ),
      setMode: (layerId: string, mode: SpeakerLaneMode) => {
        const manuscriptId = latest.current.manuscriptId;
        setModes((current) => {
          const next = { ...current, [layerId]: mode };
          if (manuscriptId !== null) writeMode(manuscriptId, JSON.stringify(next));
          return next;
        });
      },
      cycle: (layerId: string) =>
        setCycle((current) => ({ ...current, [layerId]: (current[layerId] ?? 0) + 1 })),
      lock: (layerId: string) => {
        const current = latest.current;
        if ((modes[layerId] ?? 'single') === 'single') return;
        const layer = current.layers?.find((item) => item.id === layerId);
        const target = laneLockRow(
          layer?.units ?? [],
          current.selectedUnitId,
          layouts.get(layerId)?.cards,
        );
        if (target === null) {
          toast.showToast(t(locale, 'app.desktopTranscription.laneLockNeedsSpeaker'), 'error');
          return;
        }
        const next = { ...(locks[layerId] ?? {}), [target.speakerId]: target.row };
        void run('layers.replaceLaneLocks', {
          layerId,
          locks: Object.entries(next).map(([speakerId, laneIndex]) => ({ speakerId, laneIndex })),
        }).catch(fail);
      },
      clearConflicts: (layerId: string) => {
        const speakerIds = layouts.get(layerId)?.conflictSpeakerIds ?? [];
        if (speakerIds.length === 0) return;
        void run('layers.clearLaneLocks', { layerId, speakerIds }).catch(fail);
      },
      assign: (unitId: string, speakerId: string) => {
        const ids = latest.current.selectedUnitIds?.includes(unitId)
          ? [...latest.current.selectedUnitIds]
          : [unitId];
        const scope = latest.current.writeScope?.(ids) ?? {};
        void run('speakers.assign', { speakerId, unitIds: ids, ...scope }).catch(fail);
      },
      clear: (unitId: string) => {
        const ids = latest.current.selectedUnitIds?.includes(unitId)
          ? [...latest.current.selectedUnitIds]
          : [unitId];
        const scope = latest.current.writeScope?.(ids) ?? {};
        void run('speakers.clear', { unitIds: ids, ...scope }).catch(fail);
      },
    };
  }, [input.layers, layouts, locale, locks, modes, speakers, toast]);
}

function readMode(manuscriptId: string): string | null {
  try {
    return window.localStorage.getItem(MODE_KEY + manuscriptId);
  } catch {
    return null;
  }
}

function writeMode(manuscriptId: string, value: string) {
  try {
    window.localStorage.setItem(MODE_KEY + manuscriptId, value);
  } catch {
    // A view preference only.
  }
}
