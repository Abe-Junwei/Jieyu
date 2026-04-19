/**
 * Ready workspace axis-status hook | Ready 态时间轴状态条逻辑
 *
 * 将逻辑时长扩展与轴状态条装配从页面主组件中拆出，
 * 便于复用与审计，同时收敛主文件的回调/行数压力。
 * | Extract logical-duration expansion and axis-strip assembly from the
 * main ready-workspace component for easier review and a smaller surface area.
 */

import {
  useCallback,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { TimelineAxisStatusStripProps } from '../components/transcription/TimelineAxisStatusStrip';
import { t, tf } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { getTranscriptionAppService } from '../app/index';
import { resolveTimelineAxisStatus, shouldShowLogicalAxisLengthOnAxisStrip } from '../utils/timelineAxisStatus';

type AxisStatusRuntimeInput = Parameters<typeof resolveTimelineAxisStatus>[0];

type TimelineTopPropsBase = {
  headerProps?: Record<string, unknown>;
};

type ReadyWorkspaceAxisStatusInput<TTimelineTopProps extends TimelineTopPropsBase = TimelineTopPropsBase> = {
  timelineTopProps: TTimelineTopProps;
  selectedMediaUrl: AxisStatusRuntimeInput['selectedMediaUrl'];
  isResizingWaveform: boolean;
  handleWaveformResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  layersCount: AxisStatusRuntimeInput['layersCount'];
  playerIsReady: AxisStatusRuntimeInput['playerIsReady'];
  playerDuration: AxisStatusRuntimeInput['playerDuration'];
  selectedTimelineMedia: AxisStatusRuntimeInput['selectedTimelineMedia'];
  unitsOnCurrentMedia: AxisStatusRuntimeInput['unitsOnCurrentMedia'];
  activeTextId?: string | null;
  activeTextTimeMapping?: { logicalDurationSec?: number } | null;
  activeTextTimelineMode?: TimelineAxisStatusStripProps['timelineMode'];
  locale: Parameters<typeof t>[0];
  loadSnapshot: () => Promise<void>;
  setSaveState: (state: { kind: 'done'; message: string } | { kind: 'error'; message: string }) => void;
};

export function useReadyWorkspaceAxisStatus<TTimelineTopProps extends TimelineTopPropsBase>(
  input: ReadyWorkspaceAxisStatusInput<TTimelineTopProps>,
): {
  logicalExpandBusy: boolean;
  timelineTopPropsWithAxisStatus: TTimelineTopProps & { axisStatus?: TimelineAxisStatusStripProps };
};
export function useReadyWorkspaceAxisStatus(
  input: ReadyWorkspaceAxisStatusInput,
): {
  logicalExpandBusy: boolean;
  timelineTopPropsWithAxisStatus: TimelineTopPropsBase & { axisStatus?: TimelineAxisStatusStripProps };
};
export function useReadyWorkspaceAxisStatus<TTimelineTopProps extends TimelineTopPropsBase>(
  input: ReadyWorkspaceAxisStatusInput<TTimelineTopProps>,
) {
  const {
    timelineTopProps,
    selectedMediaUrl,
    isResizingWaveform,
    handleWaveformResizeStart,
    layersCount,
    playerIsReady,
    playerDuration,
    selectedTimelineMedia,
    unitsOnCurrentMedia,
    activeTextId,
    activeTextTimeMapping,
    activeTextTimelineMode,
    locale,
    loadSnapshot,
    setSaveState,
  } = input;

  const [logicalExpandBusy, setLogicalExpandBusy] = useState(false);

  const expandLogicalDurationFromAxisStatus = useCallback(() => {
    const hint = resolveTimelineAxisStatus({
      layersCount,
      selectedMediaUrl,
      playerIsReady,
      playerDuration,
      selectedTimelineMedia: selectedTimelineMedia ?? null,
      unitsOnCurrentMedia,
    });
    if (hint.kind !== 'duration_short' || !activeTextId) return;
    const minSec = hint.maxUnitEndSec;
    if (!Number.isFinite(minSec) || minSec <= 0) return;

    fireAndForget((async () => {
      setLogicalExpandBusy(true);
      try {
        await getTranscriptionAppService().expandTextLogicalDurationToAtLeast({
          textId: activeTextId,
          minLogicalDurationSec: minSec,
        });
        await loadSnapshot();
        setSaveState({ kind: 'done', message: t(locale, 'transcription.timelineAxisStatus.expandLogicalSuccess') });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        setSaveState({
          kind: 'error',
          message: tf(locale, 'transcription.timelineAxisStatus.expandLogicalError', { detail }),
        });
      } finally {
        setLogicalExpandBusy(false);
      }
    })());
  }, [
    activeTextId,
    layersCount,
    loadSnapshot,
    locale,
    playerDuration,
    playerIsReady,
    selectedMediaUrl,
    selectedTimelineMedia,
    setSaveState,
    unitsOnCurrentMedia,
  ]);

  const timelineTopPropsWithAxisStatus = useMemo(() => {
    const withResize = {
      ...timelineTopProps,
      headerProps: {
        ...timelineTopProps.headerProps,
        ...(selectedMediaUrl ? { onWaveformResizeStart: handleWaveformResizeStart } : {}),
        isResizingWaveform,
      },
    };
    const hint = resolveTimelineAxisStatus({
      layersCount,
      selectedMediaUrl,
      playerIsReady,
      playerDuration,
      selectedTimelineMedia: selectedTimelineMedia ?? null,
      unitsOnCurrentMedia,
    });
    let axisStatus: TimelineAxisStatusStripProps | null = null;
    if (hint.kind !== 'hidden') {
      const logicalDurationSec = activeTextTimeMapping?.logicalDurationSec;
      const logicalOk = typeof logicalDurationSec === 'number'
        && Number.isFinite(logicalDurationSec)
        && logicalDurationSec > 0;
      const showLogical = shouldShowLogicalAxisLengthOnAxisStrip({
        ...(logicalOk ? { logicalDurationSec } : {}),
        ...(activeTextTimelineMode !== undefined ? { timelineMode: activeTextTimelineMode } : {}),
        hintKind: hint.kind,
      });
      if (hint.kind !== 'acoustic_ok' || showLogical) {
        axisStatus = {
          locale,
          hint,
          ...(logicalOk ? { logicalDurationSec } : {}),
          ...(activeTextTimelineMode ? { timelineMode: activeTextTimelineMode } : {}),
          ...(hint.kind === 'duration_short' && activeTextId
            ? { expandLogical: { busy: logicalExpandBusy, onPress: expandLogicalDurationFromAxisStatus } }
            : {}),
        };
      }
    }
    return axisStatus ? { ...withResize, axisStatus } : withResize;
  }, [
    activeTextId,
    activeTextTimeMapping?.logicalDurationSec,
    activeTextTimelineMode,
    expandLogicalDurationFromAxisStatus,
    handleWaveformResizeStart,
    isResizingWaveform,
    layersCount,
    locale,
    logicalExpandBusy,
    playerDuration,
    playerIsReady,
    selectedMediaUrl,
    selectedTimelineMedia,
    timelineTopProps,
    unitsOnCurrentMedia,
  ]);

  return {
    logicalExpandBusy,
    timelineTopPropsWithAxisStatus,
  };
}
