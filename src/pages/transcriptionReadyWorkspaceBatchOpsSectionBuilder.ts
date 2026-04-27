import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';

type ReadyWorkspaceBatchOpsSection = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps']['batchOpsSection'];
type ReadyWorkspaceBatchOpsProps = ReadyWorkspaceBatchOpsSection['props'];

export type BuildReadyWorkspaceBatchOpsSectionInput = {
  shouldRenderBatchOps: ReadyWorkspaceBatchOpsSection['shouldRender'];
  showBatchOperationPanel: ReadyWorkspaceBatchOpsProps['showBatchOperationPanel'];
  selectedUnitIds: ReadyWorkspaceBatchOpsProps['selectedUnitIds'];
  selectedBatchUnits: ReadyWorkspaceBatchOpsProps['selectedBatchUnits'];
  unitsOnCurrentMedia: ReadyWorkspaceBatchOpsProps['unitsOnCurrentMedia'];
  selectedBatchUnitTextById: ReadyWorkspaceBatchOpsProps['selectedBatchUnitTextById'];
  batchPreviewLayerOptions: ReadyWorkspaceBatchOpsProps['batchPreviewLayerOptions'];
  batchPreviewTextByLayerId: ReadyWorkspaceBatchOpsProps['batchPreviewTextByLayerId'];
  batchPreviewTextPropsByLayerId: ReadyWorkspaceBatchOpsProps['batchPreviewTextPropsByLayerId'];
  defaultBatchPreviewLayerId: ReadyWorkspaceBatchOpsProps['defaultBatchPreviewLayerId'];
  onCloseBatchOps: ReadyWorkspaceBatchOpsProps['onBatchClose'];
  onBatchOffset: ReadyWorkspaceBatchOpsProps['onBatchOffset'];
  onBatchScale: ReadyWorkspaceBatchOpsProps['onBatchScale'];
  onBatchSplitByRegex: ReadyWorkspaceBatchOpsProps['onBatchSplitByRegex'];
  onBatchMerge: ReadyWorkspaceBatchOpsProps['onBatchMerge'];
  onBatchJumpToUnit: ReadyWorkspaceBatchOpsProps['onBatchJumpToUnit'];
};

export function buildReadyWorkspaceBatchOpsSection(
  input: BuildReadyWorkspaceBatchOpsSectionInput,
): ReadyWorkspaceBatchOpsSection {
  return {
    shouldRender: input.shouldRenderBatchOps,
    props: {
      showBatchOperationPanel: input.showBatchOperationPanel,
      selectedUnitIds: input.selectedUnitIds,
      selectedBatchUnits: input.selectedBatchUnits,
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      selectedBatchUnitTextById: input.selectedBatchUnitTextById,
      batchPreviewLayerOptions: input.batchPreviewLayerOptions,
      batchPreviewTextByLayerId: input.batchPreviewTextByLayerId,
      batchPreviewTextPropsByLayerId: input.batchPreviewTextPropsByLayerId ?? {},
      defaultBatchPreviewLayerId: input.defaultBatchPreviewLayerId,
      onBatchClose: () => {
        recordTranscriptionKeyboardAction('workspaceBatchOpsClose');
        input.onCloseBatchOps();
      },
      onBatchOffset: async (deltaSec) => {
        recordTranscriptionKeyboardAction('workspaceBatchOpsOffset');
        await input.onBatchOffset(deltaSec);
      },
      onBatchScale: async (factor, anchorTime) => {
        recordTranscriptionKeyboardAction('workspaceBatchOpsScale');
        await input.onBatchScale(factor, anchorTime);
      },
      onBatchSplitByRegex: async (pattern, flags) => {
        recordTranscriptionKeyboardAction('workspaceBatchOpsSplitByRegex');
        await input.onBatchSplitByRegex(pattern, flags);
      },
      onBatchMerge: async () => {
        recordTranscriptionKeyboardAction('workspaceBatchOpsMerge');
        await input.onBatchMerge();
      },
      onBatchJumpToUnit: (id) => {
        recordTranscriptionKeyboardAction('workspaceBatchOpsJumpToUnit');
        input.onBatchJumpToUnit(id);
      },
    },
  };
}
