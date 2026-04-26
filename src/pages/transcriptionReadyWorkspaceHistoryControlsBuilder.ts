import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../services/transcriptionKeyboardActionTelemetry';

type ReadyWorkspaceHistoryControlsProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps']['workspaceAreaProps']['historyControlsProps'];

export type BuildReadyWorkspaceHistoryControlsInput = {
  canUndo: ReadyWorkspaceHistoryControlsProps['canUndo'];
  canRedo: ReadyWorkspaceHistoryControlsProps['canRedo'];
  undoLabel: ReadyWorkspaceHistoryControlsProps['undoLabel'];
  undoHistory: ReadyWorkspaceHistoryControlsProps['undoHistory'];
  isHistoryVisible: ReadyWorkspaceHistoryControlsProps['isHistoryVisible'];
  onToggleHistoryVisible: ReadyWorkspaceHistoryControlsProps['onToggleHistoryVisible'];
  selectedTimelineUnit: TimelineUnit | null;
  activeTimelineUnitId: string;
  recordTimelineEdit: (input: PushTimelineEditInput) => void;
  undoToHistoryIndex: (idx: number) => Promise<void>;
  redo: () => Promise<void>;
};

export function buildReadyWorkspaceHistoryControlsProps(
  input: BuildReadyWorkspaceHistoryControlsInput,
): ReadyWorkspaceHistoryControlsProps {
  return {
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    undoLabel: input.undoLabel,
    undoHistory: input.undoHistory,
    isHistoryVisible: input.isHistoryVisible,
    onToggleHistoryVisible: (visible) => {
      recordTranscriptionKeyboardAction('timelineHistoryPanelToggle');
      input.onToggleHistoryVisible(visible);
    },
    onJumpToHistoryIndex: (idx) => fireAndForget((async () => {
      recordTranscriptionKeyboardAction('timelineHistoryJumpToIndex');
      const tu = input.selectedTimelineUnit;
      input.recordTimelineEdit({
        action: 'undo',
        unitId: (tu?.unitId ?? input.activeTimelineUnitId) || 'history',
        unitKind: tu?.kind ?? 'unit',
        detail: `historyIndex=${idx}`,
      });
      await input.undoToHistoryIndex(idx);
    })(), { context: 'src/pages/transcriptionReadyWorkspaceHistoryControlsBuilder.ts:L32', policy: 'user-visible' }),
    onRedo: () => fireAndForget((async () => {
      recordTranscriptionKeyboardAction('timelineHistoryRedo');
      const tu = input.selectedTimelineUnit;
      input.recordTimelineEdit({
        action: 'redo',
        unitId: (tu?.unitId ?? input.activeTimelineUnitId) || 'history',
        unitKind: tu?.kind ?? 'unit',
      });
      await input.redo();
    })(), { context: 'src/pages/transcriptionReadyWorkspaceHistoryControlsBuilder.ts:L42', policy: 'user-visible' }),
  };
}
