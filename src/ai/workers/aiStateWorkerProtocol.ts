export interface AiStateWorkerSlice {
  aiChatEnabled: boolean;
  aiChatMessageCount: number;
  aiChatIsStreaming: boolean;
  /** 流式中可见正文 + reasoning 字符数，用于 deferred 指纹（避免只出推理时侧边栏仍冻结） */
  aiChatStreamingPayloadChars: number;
  aiChatLastError: string;
  aiChatConnectionTestStatus: string;
  aiChatPendingToolCallId: string;
  aiChatTaskSessionStatus: string;
  aiChatTurnCount: number;
  aiChatSuccessCount: number;
  aiChatFailureCount: number;
  aiChatProviderKind: string;
  aiChatModel: string;
  aiChatSettingsFingerprint: string;
  aiChatContextChars: number;
  aiChatHistoryChars: number;
  aiToolDecisionLogCount: number;
  acousticRuntimeState: string;
  acousticRuntimePhase: string;
  acousticBatchSelectionCount: number;
  acousticCalibrationStatus: string;
  acousticProviderAvailable: boolean;
  acousticSummarySelectionStartSec: number | null;
  acousticSummarySelectionEndSec: number | null;
  acousticDetailMediaKey: string;
}

export type AiStateWorkerRequest =
  | { type: 'state_slice'; payload: AiStateWorkerSlice }
  | { type: 'flush'; payload: AiStateWorkerSlice };

export type AiStateWorkerResponse = {
  type: 'fingerprint-updated';
  fingerprint: string;
};

export const AI_STATE_WORKER_DEFAULT_THRESHOLDS = {
  charDelta: 50,
  opCount: 5,
  idleAfterEditMs: 2000,
} as const;

function normalizeNumber(value: number | null | undefined): string {
  if (value == null) return '';
  return Number.isFinite(value) ? value.toFixed(3) : '';
}

export function buildAiStateWorkerFingerprint(slice: AiStateWorkerSlice): string {
  return [
    slice.aiChatEnabled ? '1' : '0',
    String(slice.aiChatMessageCount),
    slice.aiChatIsStreaming ? '1' : '0',
    String(slice.aiChatStreamingPayloadChars),
    slice.aiChatLastError,
    slice.aiChatConnectionTestStatus,
    slice.aiChatPendingToolCallId,
    slice.aiChatTaskSessionStatus,
    String(slice.aiChatTurnCount),
    String(slice.aiChatSuccessCount),
    String(slice.aiChatFailureCount),
    slice.aiChatProviderKind,
    slice.aiChatModel,
    slice.aiChatSettingsFingerprint,
    String(slice.aiChatContextChars),
    String(slice.aiChatHistoryChars),
    String(slice.aiToolDecisionLogCount),
    slice.acousticRuntimeState,
    slice.acousticRuntimePhase,
    String(slice.acousticBatchSelectionCount),
    slice.acousticCalibrationStatus,
    slice.acousticProviderAvailable ? '1' : '0',
    normalizeNumber(slice.acousticSummarySelectionStartSec),
    normalizeNumber(slice.acousticSummarySelectionEndSec),
    slice.acousticDetailMediaKey,
  ].join('|');
}

export function computeAiStateWorkerSignalWeight(slice: AiStateWorkerSlice): number {
  const summaryStart = slice.acousticSummarySelectionStartSec ?? 0;
  const summaryEnd = slice.acousticSummarySelectionEndSec ?? 0;
  return (
    slice.aiChatMessageCount * 8
    + (slice.aiChatIsStreaming ? 19 : 0)
    + slice.aiChatStreamingPayloadChars
    + slice.aiChatTurnCount * 7
    + slice.aiChatSuccessCount * 11
    + slice.aiChatFailureCount * 13
    + slice.aiChatContextChars
    + slice.aiChatHistoryChars
    + slice.aiToolDecisionLogCount * 5
    + slice.acousticBatchSelectionCount * 17
    + (slice.acousticProviderAvailable ? 3 : 0)
    + Math.round(summaryStart * 10)
    + Math.round(summaryEnd * 10)
    + slice.aiChatLastError.length * 2
    + slice.aiChatConnectionTestStatus.length
    + slice.aiChatPendingToolCallId.length
    + slice.aiChatTaskSessionStatus.length
    + slice.aiChatProviderKind.length
    + slice.aiChatModel.length
    + slice.aiChatSettingsFingerprint.length
    + slice.acousticRuntimeState.length
    + slice.acousticRuntimePhase.length
    + slice.acousticCalibrationStatus.length
    + slice.acousticDetailMediaKey.length
  );
}
