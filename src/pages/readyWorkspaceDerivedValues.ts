import { computeEffectiveTimelineShellLayersCount } from '../utils/timelineShellMode';

interface VerticalComparisonInput {
  verticalViewActive: boolean;
  layersCount: number;
  transcriptionLayerCount: number;
  translationLayerCount: number;
}

export function computeVerticalComparisonEnabled(input: VerticalComparisonInput): boolean {
  const {
    verticalViewActive,
    layersCount,
    transcriptionLayerCount,
    translationLayerCount,
  } = input;

  return Boolean(
    verticalViewActive
    && computeEffectiveTimelineShellLayersCount({
      orchestratorLayersCount: layersCount,
      transcriptionLayerCount,
      translationLayerCount,
    }) > 0,
  );
}

interface TimelineContentGutterInput {
  isTimelineLaneHeaderCollapsed: boolean;
  laneLabelWidth: number;
  /** 未选媒体时上游常为 `undefined`；与 `exactOptionalPropertyTypes` 对齐 | May be undefined when no media is selected */
  selectedMediaUrl?: string | undefined;
  selectedMediaIsVideo: boolean;
  videoLayoutMode: string;
  videoRightPanelWidth: number;
}

export function computeTimelineContentGutterPx(input: TimelineContentGutterInput): number {
  const {
    isTimelineLaneHeaderCollapsed,
    laneLabelWidth,
    selectedMediaUrl,
    selectedMediaIsVideo,
    videoLayoutMode,
    videoRightPanelWidth,
  } = input;

  const labelPx = isTimelineLaneHeaderCollapsed ? 0 : laneLabelWidth;
  const videoLeftPx = typeof selectedMediaUrl === 'string' && selectedMediaUrl.trim() !== ''
    && selectedMediaIsVideo
    && videoLayoutMode === 'left'
    ? videoRightPanelWidth + 8
    : 0;
  return labelPx + videoLeftPx;
}

interface ActiveTextLogicalDurationState {
  phase: string;
  textLogicalDurationSecFromSnapshot?: number;
}

interface ResolveLogicalDurationInput {
  activeTextTimeMapping?: { logicalDurationSec?: number } | null;
  state: ActiveTextLogicalDurationState;
}

export function resolveActiveTextLogicalDurationSecForBridge(
  input: ResolveLogicalDurationInput,
): number | undefined {
  const { activeTextTimeMapping, state } = input;

  if (typeof activeTextTimeMapping?.logicalDurationSec === 'number'
    && Number.isFinite(activeTextTimeMapping.logicalDurationSec)) {
    return activeTextTimeMapping.logicalDurationSec;
  }
  if (state.phase === 'ready') {
    const s = state.textLogicalDurationSecFromSnapshot;
    if (typeof s === 'number' && Number.isFinite(s) && s > 0) {
      return s;
    }
  }
  return undefined;
}
