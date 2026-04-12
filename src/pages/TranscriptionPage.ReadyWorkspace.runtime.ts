/**
 * ReadyWorkspace 运行时拆分模块 | ReadyWorkspace runtime extraction module
 *
 * 说明 | Notes:
 * - 抽离 lazy 组件注册与 AI 状态切片构建，降低主文件复杂度。
 * - Keep behavior unchanged while reducing main file complexity.
 */

import { lazy } from 'react';
import type { DeferredTranscriptionAiRuntimeState } from './TranscriptionPage.AssistantBridge';
import type { AiStateWorkerSlice } from '../ai/workers/aiStateWorkerProtocol';

export function createInitialDeferredAiRuntimeState(): DeferredTranscriptionAiRuntimeState {
  return {
    aiChat: {
      enabled: false,
      providerLabel: undefined,
      settings: undefined,
      messages: [],
      isStreaming: false,
      lastError: null,
      connectionTestStatus: 'idle',
      connectionTestMessage: null,
      contextDebugSnapshot: null,
      pendingToolCall: null,
      taskSession: null,
      metrics: null,
      sessionMemory: null,
      updateSettings: undefined,
      testConnection: undefined,
      send: undefined,
      stop: undefined,
      clear: undefined,
      toggleMessagePinned: undefined,
      confirmPendingToolCall: undefined,
      cancelPendingToolCall: undefined,
      trackRecommendationEvent: undefined,
    },
    aiToolDecisionLogs: [],
    acousticRuntimeStatus: { state: 'idle' },
    acousticSummary: null,
    acousticDetail: null,
    acousticDetailFullMedia: null,
    acousticBatchDetails: [],
    acousticBatchSelectionCount: 0,
    acousticBatchDroppedSelectionRanges: [],
    acousticCalibrationStatus: 'exploratory',
    acousticProviderState: {
      requestedProviderId: 'local-yin-spectral',
      effectiveProviderId: 'local-yin-spectral',
      reachability: { id: 'local-yin-spectral', available: true, latencyMs: 0 },
      fellBackToLocal: false,
    },
    onJumpToAcousticHotspot: () => undefined,
  } as unknown as DeferredTranscriptionAiRuntimeState;
}

export const TranscriptionPageAiSidebar = lazy(async () => import('./TranscriptionPage.AiSidebar').then((module) => ({
  default: module.TranscriptionPageAiSidebar,
})));

export const TranscriptionPageToolbar = lazy(async () => import('./TranscriptionPage.Toolbar').then((module) => ({
  default: module.TranscriptionPageToolbar,
})));

export const TranscriptionPageBatchOps = lazy(async () => import('./TranscriptionPage.BatchOps').then((module) => ({
  default: module.TranscriptionPageBatchOps,
})));

export const TranscriptionPageDialogs = lazy(async () => import('./TranscriptionPage.Dialogs').then((module) => ({
  default: module.TranscriptionPageDialogs,
})));

export const TranscriptionPageTimelineContent = lazy(async () => import('./TranscriptionPage.TimelineContent').then((module) => ({
  default: module.TranscriptionPageTimelineContent,
})));

export const TranscriptionPageTimelineTop = lazy(async () => import('./TranscriptionPage.TimelineTop').then((module) => ({
  default: module.TranscriptionPageTimelineTop,
})));

export const TranscriptionPageSidePane = lazy(async () => import('./TranscriptionPage.SidePane').then((module) => ({
  default: module.TranscriptionPageSidePane,
})));

export const TranscriptionOverlays = lazy(async () => import('../components/TranscriptionOverlays').then((module) => ({
  default: module.TranscriptionOverlays,
})));

export const RecoveryBanner = lazy(async () => import('../components/RecoveryBanner').then((module) => ({
  default: module.RecoveryBanner,
})));

export const TranscriptionPagePdfRuntime = lazy(async () => import('./TranscriptionPage.PdfRuntime').then((module) => ({
  default: module.TranscriptionPagePdfRuntime,
})));

export const TranscriptionPageAssistantBridge = lazy(async () => import('./TranscriptionPage.AssistantBridge').then((module) => ({
  default: module.TranscriptionPageAssistantBridge,
})));

export function buildAiStateWorkerSlice(state: DeferredTranscriptionAiRuntimeState): AiStateWorkerSlice {
  const pendingToolCallId = state.aiChat.pendingToolCall?.requestId
    ?? state.aiChat.pendingToolCall?.call.requestId
    ?? state.aiChat.pendingToolCall?.assistantMessageId
    ?? '';
  return {
    aiChatEnabled: state.aiChat.enabled,
    aiChatMessageCount: state.aiChat.messages.length,
    aiChatIsStreaming: state.aiChat.isStreaming,
    aiChatLastError: state.aiChat.lastError ?? '',
    aiChatConnectionTestStatus: state.aiChat.connectionTestStatus,
    aiChatPendingToolCallId: pendingToolCallId,
    aiChatTaskSessionStatus: state.aiChat.taskSession?.status ?? '',
    aiChatTurnCount: state.aiChat.metrics?.turnCount ?? 0,
    aiChatSuccessCount: state.aiChat.metrics?.successCount ?? 0,
    aiChatFailureCount: state.aiChat.metrics?.failureCount ?? 0,
    aiChatProviderKind: state.aiChat.settings?.providerKind ?? '',
    aiChatModel: state.aiChat.settings?.model ?? '',
    aiChatContextChars: state.aiChat.contextDebugSnapshot?.contextChars ?? 0,
    aiChatHistoryChars: state.aiChat.contextDebugSnapshot?.historyChars ?? 0,
    aiToolDecisionLogCount: state.aiToolDecisionLogs.length,
    acousticRuntimeState: state.acousticRuntimeStatus.state,
    acousticRuntimePhase: state.acousticRuntimeStatus.phase ?? '',
    acousticBatchSelectionCount: state.acousticBatchSelectionCount,
    acousticCalibrationStatus: String(state.acousticCalibrationStatus ?? ''),
    acousticProviderAvailable: state.acousticProviderState.reachability.available,
    acousticSummarySelectionStartSec: state.acousticSummary?.selectionStartSec ?? null,
    acousticSummarySelectionEndSec: state.acousticSummary?.selectionEndSec ?? null,
    acousticDetailMediaKey: state.acousticDetail?.mediaKey ?? '',
  };
}
