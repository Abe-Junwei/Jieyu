import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';

type ReadyWorkspaceStageProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps'];
type ReadyWorkspaceObserverProps = ReadyWorkspaceStageProps['observerProps'];

export type BuildReadyWorkspaceObserverPropsInput = {
  observerStage: ReadyWorkspaceObserverProps['observerStage'];
  recommendations: ReadyWorkspaceObserverProps['recommendations'];
  onExecuteRecommendation: ReadyWorkspaceObserverProps['onExecuteRecommendation'];
};

/** ARCH-7 收口：observerProps 程序集独立模块化 | ARCH-7 closure: isolate observer props assembly. */
export function buildReadyWorkspaceObserverProps(
  input: BuildReadyWorkspaceObserverPropsInput,
): ReadyWorkspaceObserverProps {
  return {
    observerStage: input.observerStage,
    recommendations: input.recommendations,
    onExecuteRecommendation: (item) => {
      recordTranscriptionKeyboardAction('workspaceObserverRecommendationExecute');
      input.onExecuteRecommendation(item);
    },
  };
}
