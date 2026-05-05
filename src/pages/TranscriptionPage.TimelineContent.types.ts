import type { ComponentProps } from 'react';
import type { TimelineAcousticState } from '../utils/mapAcousticToTimelineChrome';
import type { TranscriptionTimelineWorkspacePanelProps } from './transcriptionTimelineWorkspacePanelTypes';
import type { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';

export type TimelineWorkspaceHostShell = 'waveform' | 'text-only' | 'empty';
export type TranscriptionPageTimelineHorizontalMediaLanesProps = ComponentProps<typeof import('../components/TranscriptionTimelineHorizontalMediaLanes').TranscriptionTimelineHorizontalMediaLanes>;
/** 纵向对读 / 编排透传；与 `TranscriptionTimelineWorkspacePanelProps` 同形 */
export type TranscriptionPageTimelineTextOnlyProps = TranscriptionTimelineWorkspacePanelProps;
export type TranscriptionPageTimelineEmptyStateProps = ComponentProps<typeof TranscriptionPageTimelineEmptyState>;

export interface TranscriptionPageTimelineContentProps {
  workspaceShell: TimelineWorkspaceHostShell;
  workspaceAcousticPending: boolean;
  /** 与 read model `acoustic.globalState` 同源，供 tier `mapAcousticToTimelineChrome`；合同态仍见 `workspaceAcousticPending`。 */
  workspaceAcousticChromeState: TimelineAcousticState;
  verticalComparisonEnabled: boolean;
  mediaLanesProps: TranscriptionPageTimelineHorizontalMediaLanesProps;
  textOnlyProps: TranscriptionPageTimelineTextOnlyProps;
  emptyStateProps: TranscriptionPageTimelineEmptyStateProps;
}
