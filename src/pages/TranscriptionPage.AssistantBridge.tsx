import { useEffect, useMemo, useRef } from 'react';
import {
  useTranscriptionAiController,
  type UseTranscriptionAiControllerInput,
  type UseTranscriptionAiControllerResult,
} from './useTranscriptionAiController';
import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import type { AcousticPromptSummary } from './TranscriptionPage.aiPromptContext';
import type {
  AcousticBatchSelectionRange,
  AcousticCalibrationStatus,
  AcousticPanelBatchDetail,
  AcousticPanelDetail,
} from '../utils/acousticPanelDetail';
import type { ResolvedAcousticProviderState } from '../services/acoustic/acousticProviderContract';

type DeferredAiChatState = {
  enabled: UseTranscriptionAiControllerResult['aiChat']['enabled'];
  providerLabel: UseTranscriptionAiControllerResult['aiChat']['providerLabel'];
  settings: UseTranscriptionAiControllerResult['aiChat']['settings'];
  messages: UseTranscriptionAiControllerResult['aiChat']['messages'];
  isStreaming: UseTranscriptionAiControllerResult['aiChat']['isStreaming'];
  lastError: UseTranscriptionAiControllerResult['aiChat']['lastError'];
  connectionTestStatus: UseTranscriptionAiControllerResult['aiChat']['connectionTestStatus'];
  connectionTestMessage: UseTranscriptionAiControllerResult['aiChat']['connectionTestMessage'];
  contextDebugSnapshot: UseTranscriptionAiControllerResult['aiChat']['contextDebugSnapshot'];
  pendingToolCall: UseTranscriptionAiControllerResult['aiChat']['pendingToolCall'];
  taskSession: UseTranscriptionAiControllerResult['aiChat']['taskSession'];
  metrics: UseTranscriptionAiControllerResult['aiChat']['metrics'];
  sessionMemory: UseTranscriptionAiControllerResult['aiChat']['sessionMemory'];
  updateSettings: UseTranscriptionAiControllerResult['aiChat']['updateSettings'];
  testConnection: UseTranscriptionAiControllerResult['aiChat']['testConnection'];
  send: UseTranscriptionAiControllerResult['aiChat']['send'];
  stop: UseTranscriptionAiControllerResult['aiChat']['stop'];
  clear: UseTranscriptionAiControllerResult['aiChat']['clear'];
  confirmPendingToolCall: UseTranscriptionAiControllerResult['aiChat']['confirmPendingToolCall'];
  cancelPendingToolCall: UseTranscriptionAiControllerResult['aiChat']['cancelPendingToolCall'];
  trackRecommendationEvent: UseTranscriptionAiControllerResult['aiChat']['trackRecommendationEvent'];
};

export interface DeferredTranscriptionAiRuntimeState {
  aiChat: DeferredAiChatState;
  aiToolDecisionLogs: UseTranscriptionAiControllerResult['aiToolDecisionLogs'];
  acousticRuntimeStatus: AcousticRuntimeStatus;
  acousticSummary: AcousticPromptSummary | null;
  acousticDetail: AcousticPanelDetail | null;
  acousticDetailFullMedia: AcousticPanelDetail | null;
  acousticBatchDetails: AcousticPanelBatchDetail[];
  acousticBatchSelectionCount: number;
  acousticBatchDroppedSelectionRanges: AcousticBatchSelectionRange[];
  acousticCalibrationStatus: AcousticCalibrationStatus;
  acousticProviderState: ResolvedAcousticProviderState;
  onJumpToAcousticHotspot: (timeSec: number) => void;
}

interface TranscriptionPageAssistantBridgeProps {
  controllerInput: UseTranscriptionAiControllerInput;
  onRuntimeStateChange: (state: DeferredTranscriptionAiRuntimeState) => void;
}

function buildRuntimeStateFingerprint(state: DeferredTranscriptionAiRuntimeState): string {
  try {
    const visited = new WeakSet<object>();
    return JSON.stringify({
      aiChat: {
        enabled: state.aiChat.enabled,
        providerLabel: state.aiChat.providerLabel,
        settings: state.aiChat.settings,
        messages: state.aiChat.messages,
        isStreaming: state.aiChat.isStreaming,
        lastError: state.aiChat.lastError,
        connectionTestStatus: state.aiChat.connectionTestStatus,
        connectionTestMessage: state.aiChat.connectionTestMessage,
        contextDebugSnapshot: state.aiChat.contextDebugSnapshot,
        pendingToolCall: state.aiChat.pendingToolCall,
        taskSession: state.aiChat.taskSession,
        metrics: state.aiChat.metrics,
        sessionMemory: state.aiChat.sessionMemory,
      },
      aiToolDecisionLogs: state.aiToolDecisionLogs,
      acousticRuntimeStatus: state.acousticRuntimeStatus,
      acousticSummary: state.acousticSummary,
      acousticDetail: state.acousticDetail,
      acousticDetailFullMedia: state.acousticDetailFullMedia,
      acousticBatchDetails: state.acousticBatchDetails,
      acousticBatchSelectionCount: state.acousticBatchSelectionCount,
      acousticBatchDroppedSelectionRanges: state.acousticBatchDroppedSelectionRanges,
      acousticCalibrationStatus: state.acousticCalibrationStatus,
      acousticProviderState: state.acousticProviderState,
    }, (_key, value) => {
      if (typeof value === 'function') return undefined;
      if (value && typeof value === 'object') {
        if (visited.has(value as object)) return '[Circular]';
        visited.add(value as object);
      }
      return value;
    }) ?? '';
  } catch {
    return [
      state.aiChat.enabled ? 'chat:1' : 'chat:0',
      `messages:${state.aiChat.messages.length}`,
      `streaming:${state.aiChat.isStreaming ? 1 : 0}`,
      `runtime:${state.acousticRuntimeStatus.phase ?? 'none'}`,
      `provider:${state.acousticProviderState.reachability.available ? 'available' : 'unavailable'}`,
    ].join('|');
  }
}

function TranscriptionPageAssistantBridge({
  controllerInput,
  onRuntimeStateChange,
}: TranscriptionPageAssistantBridgeProps) {
  const lastFingerprintRef = useRef<string>('');

  const {
    aiChat,
    aiToolDecisionLogs,
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    acousticDetailFullMedia,
    acousticBatchDetails,
    acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus,
    acousticProviderState,
    handleJumpToAcousticHotspot,
  } = useTranscriptionAiController(controllerInput);

  const runtimeState = useMemo<DeferredTranscriptionAiRuntimeState>(() => ({
    aiChat: {
      enabled: aiChat.enabled,
      providerLabel: aiChat.providerLabel,
      settings: aiChat.settings,
      messages: aiChat.messages,
      isStreaming: aiChat.isStreaming,
      lastError: aiChat.lastError,
      connectionTestStatus: aiChat.connectionTestStatus,
      connectionTestMessage: aiChat.connectionTestMessage,
      contextDebugSnapshot: aiChat.contextDebugSnapshot,
      pendingToolCall: aiChat.pendingToolCall,
      taskSession: aiChat.taskSession,
      metrics: aiChat.metrics,
      sessionMemory: aiChat.sessionMemory,
      updateSettings: aiChat.updateSettings,
      testConnection: aiChat.testConnection,
      send: aiChat.send,
      stop: aiChat.stop,
      clear: aiChat.clear,
      confirmPendingToolCall: aiChat.confirmPendingToolCall,
      cancelPendingToolCall: aiChat.cancelPendingToolCall,
      trackRecommendationEvent: aiChat.trackRecommendationEvent,
    },
    aiToolDecisionLogs,
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    acousticDetailFullMedia,
    acousticBatchDetails,
    acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus,
    acousticProviderState,
    onJumpToAcousticHotspot: handleJumpToAcousticHotspot,
  }), [
    acousticBatchDetails,
    acousticBatchDroppedSelectionRanges,
    acousticBatchSelectionCount,
    acousticCalibrationStatus,
    acousticDetailFullMedia,
    acousticProviderState,
    acousticRuntimeStatus,
    acousticDetail,
    acousticSummary,
    aiChat.cancelPendingToolCall,
    aiChat.clear,
    aiChat.confirmPendingToolCall,
    aiChat.connectionTestMessage,
    aiChat.connectionTestStatus,
    aiChat.contextDebugSnapshot,
    aiChat.enabled,
    aiChat.isStreaming,
    aiChat.lastError,
    aiChat.messages,
    aiChat.metrics,
    aiChat.pendingToolCall,
    aiChat.providerLabel,
    aiChat.send,
    aiChat.sessionMemory,
    aiChat.settings,
    aiChat.stop,
    aiChat.taskSession,
    aiChat.testConnection,
    aiChat.trackRecommendationEvent,
    aiChat.updateSettings,
    aiToolDecisionLogs,
    handleJumpToAcousticHotspot,
  ]);

  const runtimeStateFingerprint = useMemo(
    () => buildRuntimeStateFingerprint(runtimeState),
    [runtimeState],
  );

  useEffect(() => {
    if (lastFingerprintRef.current === runtimeStateFingerprint) {
      return;
    }
    lastFingerprintRef.current = runtimeStateFingerprint;
    onRuntimeStateChange(runtimeState);
  }, [onRuntimeStateChange, runtimeState, runtimeStateFingerprint]);

  return null;
}

export { TranscriptionPageAssistantBridge };