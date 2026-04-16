import type { LayerUnitDocType } from '../db';
import { BatchOperationPanel } from '../components/BatchOperationPanel';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';

type TranscriptionPageBatchOpsProps = {
  showBatchOperationPanel: boolean;
  selectedUnitIds: Set<string>;
  selectedBatchUnits: Pick<LayerUnitDocType, 'id' | 'startTime' | 'endTime'>[];
  unitsOnCurrentMedia: LayerUnitDocType[];
  selectedBatchUnitTextById: Record<string, string>;
  batchPreviewLayerOptions: Array<{ id: string; label: string }>;
  batchPreviewTextByLayerId: Record<string, Record<string, string>> | null;
  batchPreviewTextPropsByLayerId?: Record<string, OrthographyPreviewTextProps>;
  defaultBatchPreviewLayerId: string | undefined;
  onBatchClose: () => void;
  onBatchOffset: (deltaSec: number) => Promise<void>;
  onBatchScale: (factor: number, anchorTime?: number) => Promise<void>;
  onBatchSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  onBatchMerge: () => Promise<void>;
  onBatchJumpToUnit: (id: string) => void;
};

export function TranscriptionPageBatchOps({
  showBatchOperationPanel,
  selectedUnitIds,
  selectedBatchUnits,
  unitsOnCurrentMedia,
  selectedBatchUnitTextById,
  batchPreviewLayerOptions,
  batchPreviewTextByLayerId,
  batchPreviewTextPropsByLayerId,
  defaultBatchPreviewLayerId,
  onBatchClose,
  onBatchOffset,
  onBatchScale,
  onBatchSplitByRegex,
  onBatchMerge,
  onBatchJumpToUnit,
}: TranscriptionPageBatchOpsProps) {
  if (!showBatchOperationPanel) return null;
  return (
    <BatchOperationPanel
      selectedCount={selectedUnitIds.size}
      selectedUnits={selectedBatchUnits}
      allUnitsOnMedia={unitsOnCurrentMedia}
      unitTextById={selectedBatchUnitTextById}
      previewLayerOptions={batchPreviewLayerOptions}
      {...(batchPreviewTextByLayerId ? { previewTextByLayerId: batchPreviewTextByLayerId } : {})}
      {...(batchPreviewTextPropsByLayerId ? { previewTextPropsByLayerId: batchPreviewTextPropsByLayerId } : {})}
      {...(defaultBatchPreviewLayerId ? { defaultPreviewLayerId: defaultBatchPreviewLayerId } : {})}
      onClose={onBatchClose}
      onOffset={onBatchOffset}
      onScale={onBatchScale}
      onSplitByRegex={onBatchSplitByRegex}
      onMerge={onBatchMerge}
      onJumpToUnit={onBatchJumpToUnit}
    />
  );
}
