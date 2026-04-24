import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';

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
      onBatchClose: input.onCloseBatchOps,
      onBatchOffset: input.onBatchOffset,
      onBatchScale: input.onBatchScale,
      onBatchSplitByRegex: input.onBatchSplitByRegex,
      onBatchMerge: input.onBatchMerge,
      onBatchJumpToUnit: input.onBatchJumpToUnit,
    },
  };
}
