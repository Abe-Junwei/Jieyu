import type { TimelineUnit } from '../hooks/transcription/transcriptionTypes';

export type TimelineSelectionWaveformItem = {
  id: string;
  startTime?: number;
  endTime?: number;
};

export type TimelineSelectionCommand =
  | { type: 'selectTimelineUnit'; unit: TimelineUnit | null }
  | { type: 'selectUnit'; unitId: string }
  | { type: 'selectUnitRange'; startId: string; endId: string }
  | { type: 'toggleUnitSelection'; unitId: string }
  | { type: 'toggleSegmentSelection'; segmentId: string }
  | {
      type: 'selectSegmentRange';
      anchorId: string;
      targetId: string;
      waveformTimelineItems: ReadonlyArray<TimelineSelectionWaveformItem>;
    }
  | { type: 'clear' }
  | { type: 'selectAll' };

export type TimelineSelectionCommandDeps = {
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  selectUnit: (unitId: string) => void;
  selectUnitRange: (startId: string, endId: string) => void;
  toggleUnitSelection: (unitId: string) => void;
  toggleSegmentSelection: (segmentId: string) => void;
  selectSegmentRange: (
    anchorId: string,
    targetId: string,
    items: ReadonlyArray<{ id: string }>,
  ) => void;
  clearUnitSelection: () => void;
  selectAllUnits: () => void;
};

/** 阶段 F：选集写路径单入口（薄 funnel，委托既有 selection actions）。 */
export function applyTimelineSelectionCommand(
  command: TimelineSelectionCommand,
  deps: TimelineSelectionCommandDeps,
): void {
  switch (command.type) {
    case 'selectTimelineUnit':
      deps.selectTimelineUnit(command.unit);
      return;
    case 'selectUnit':
      deps.selectUnit(command.unitId);
      return;
    case 'selectUnitRange':
      deps.selectUnitRange(command.startId, command.endId);
      return;
    case 'toggleUnitSelection':
      deps.toggleUnitSelection(command.unitId);
      return;
    case 'toggleSegmentSelection':
      deps.toggleSegmentSelection(command.segmentId);
      return;
    case 'selectSegmentRange':
      deps.selectSegmentRange(command.anchorId, command.targetId, command.waveformTimelineItems);
      return;
    case 'clear':
      deps.clearUnitSelection();
      return;
    case 'selectAll':
      deps.selectAllUnits();
      return;
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export type TimelineSelectionWriteInput = {
  applyTimelineSelectionCommand?: (command: TimelineSelectionCommand) => void;
} & TimelineSelectionCommandDeps;

/** ReadyWorkspace 优先走 funnel；缺省时委托 legacy selection actions。 */
export function writeTimelineSelection(
  command: TimelineSelectionCommand,
  input: TimelineSelectionWriteInput,
): void {
  if (input.applyTimelineSelectionCommand) {
    input.applyTimelineSelectionCommand(command);
    return;
  }
  applyTimelineSelectionCommand(command, input);
}
