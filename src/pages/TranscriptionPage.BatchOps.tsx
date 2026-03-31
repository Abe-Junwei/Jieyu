import type { UtteranceDocType } from '../db';
import { BatchOperationPanel } from '../components/BatchOperationPanel';
import type { OrthographyPreviewTextProps } from '../utils/layerDisplayStyle';

type TranscriptionPageBatchOpsProps = {
  showBatchOperationPanel: boolean;
  selectedUtteranceIds: Set<string>;
  selectedBatchUtterances: Pick<UtteranceDocType, 'id' | 'startTime' | 'endTime'>[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedBatchUtteranceTextById: Record<string, string>;
  batchPreviewLayerOptions: Array<{ id: string; label: string }>;
  batchPreviewTextByLayerId: Record<string, Record<string, string>> | null;
  batchPreviewTextPropsByLayerId?: Record<string, OrthographyPreviewTextProps>;
  defaultBatchPreviewLayerId: string | undefined;
  onBatchClose: () => void;
  onBatchOffset: (deltaSec: number) => Promise<void>;
  onBatchScale: (factor: number, anchorTime?: number) => Promise<void>;
  onBatchSplitByRegex: (pattern: string, flags?: string) => Promise<void>;
  onBatchMerge: () => Promise<void>;
  onBatchJumpToUtterance: (id: string) => void;
};

export function TranscriptionPageBatchOps({
  showBatchOperationPanel,
  selectedUtteranceIds,
  selectedBatchUtterances,
  utterancesOnCurrentMedia,
  selectedBatchUtteranceTextById,
  batchPreviewLayerOptions,
  batchPreviewTextByLayerId,
  batchPreviewTextPropsByLayerId,
  defaultBatchPreviewLayerId,
  onBatchClose,
  onBatchOffset,
  onBatchScale,
  onBatchSplitByRegex,
  onBatchMerge,
  onBatchJumpToUtterance,
}: TranscriptionPageBatchOpsProps) {
  if (!showBatchOperationPanel) return null;
  return (
    <BatchOperationPanel
      selectedCount={selectedUtteranceIds.size}
      selectedUtterances={selectedBatchUtterances}
      allUtterancesOnMedia={utterancesOnCurrentMedia}
      utteranceTextById={selectedBatchUtteranceTextById}
      previewLayerOptions={batchPreviewLayerOptions}
      {...(batchPreviewTextByLayerId ? { previewTextByLayerId: batchPreviewTextByLayerId } : {})}
      {...(batchPreviewTextPropsByLayerId ? { previewTextPropsByLayerId: batchPreviewTextPropsByLayerId } : {})}
      {...(defaultBatchPreviewLayerId ? { defaultPreviewLayerId: defaultBatchPreviewLayerId } : {})}
      onClose={onBatchClose}
      onOffset={onBatchOffset}
      onScale={onBatchScale}
      onSplitByRegex={onBatchSplitByRegex}
      onMerge={onBatchMerge}
      onJumpToUtterance={onBatchJumpToUtterance}
    />
  );
}
